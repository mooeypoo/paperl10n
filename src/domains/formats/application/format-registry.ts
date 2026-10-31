// SPDX-License-Identifier: GPL-3.0-or-later
import type { PlaceholderToken } from '#domains/catalog';
import type { SourceDocument } from '#domains/document';
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { compareMatches, type Detection, type DetectionConfidence } from '../domain/detection.ts';
import type { FormatId } from '../domain/format-id.ts';
import { parsePluginManifest, type PluginManifest } from '../domain/plugin-manifest.ts';
import type {
  CatalogEdit,
  CatalogFormat,
  CatalogLayout,
  ParsedCatalog,
  SourceCatalog,
} from './ports/catalog-format.ts';
import type { DocumentFormat, ProjectLocale } from './ports/document-format.ts';
import type { FormatContext } from './ports/format-context.ts';
import type { FormatError, PluginError } from './ports/plugin-error.ts';
import type { FormatPlugin, PluginHost, PluginModule } from './ports/plugin-module.ts';
import type { ProjectFiles } from './ports/project-files.ts';

// Guarded views: what the rest of the app uses. Every call returns a Result; a plugin that
// throws or rejects produces `formats.plugin-failed` instead of crashing the app.

export interface GuardedDocumentLayout {
  readonly locales: readonly ProjectLocale[];
  listSourceDocuments(): Promise<Result<readonly SourceDocument[], FormatError>>;
  targetPathFor(document: SourceDocument, target: LocaleId): Result<ProjectPath, FormatError>;
  /** The plugin's `sourceLinkTarget`, or the target as written when it has none. */
  sourceLinkTarget(target: string, locale: LocaleId): Result<string, FormatError>;
}

export interface RegisteredDocumentFormat {
  readonly kind: 'document';
  readonly manifest: PluginManifest;
  detect(files: ProjectFiles): Promise<Result<Detection, FormatError>>;
  open(context: FormatContext): Promise<Result<GuardedDocumentLayout, FormatError>>;
}

export interface GuardedCatalogLayout {
  readonly locales: readonly LocaleId[];
  listCatalogs(): Promise<Result<readonly SourceCatalog[], FormatError>>;
  targetPathFor(catalog: SourceCatalog, locale: LocaleId): Result<ProjectPath, FormatError>;
}

export interface RegisteredCatalogFormat {
  readonly kind: 'catalog';
  readonly manifest: PluginManifest;
  detect(files: ProjectFiles): Promise<Result<Detection, FormatError>>;
  open(context: FormatContext): Promise<Result<GuardedCatalogLayout, FormatError>>;
  parse(text: string): Result<ParsedCatalog, FormatError>;
  serialize(edit: CatalogEdit): Result<string, FormatError>;
  scanPlaceholders(text: string): Result<readonly PlaceholderToken[], FormatError>;
}

export type RegisteredFormat = RegisteredDocumentFormat | RegisteredCatalogFormat;

export interface DetectedFormat {
  readonly format: RegisteredFormat;
  readonly confidence: DetectionConfidence;
  readonly evidence: readonly ProjectPath[];
}

export interface DetectionReport {
  /** Plugins that recognized the project, best first. */
  readonly matches: readonly DetectedFormat[];
  /** Plugins whose detection failed. They're left out of `matches`. */
  readonly failures: readonly FormatError[];
}

export interface FormatRegistry {
  readonly documentFormats: readonly RegisteredDocumentFormat[];
  readonly catalogFormats: readonly RegisteredCatalogFormat[];
  /** Looks a plugin up by id (a plain string, as it appears in config). */
  find(id: string): RegisteredFormat | undefined;
  /** Runs every plugin's detection concurrently. */
  detect(files: ProjectFiles): Promise<DetectionReport>;
}

export interface RegistryProblem {
  /** The plugin's id, when known. */
  readonly pluginId?: string;
  readonly problem:
    'manifest-invalid' | 'duplicate-id' | 'create-failed' | 'kind-mismatch' | 'missing-capability';
  readonly detail: string;
}

export interface RegistryError {
  readonly code: 'formats.registry-invalid';
  readonly problems: readonly RegistryProblem[];
}

function describeThrown(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function guard<T>(formatId: FormatId, call: () => Result<T, PluginError>): Result<T, FormatError> {
  try {
    const result = call();
    return result.ok ? result : err({ ...result.error, formatId });
  } catch (thrown) {
    return err({ code: 'formats.plugin-failed', formatId, reason: describeThrown(thrown) });
  }
}

async function guardAsync<T>(
  formatId: FormatId,
  call: () => Promise<Result<T, PluginError>>,
): Promise<Result<T, FormatError>> {
  try {
    const result = await call();
    return result.ok ? result : err({ ...result.error, formatId });
  } catch (thrown) {
    return err({ code: 'formats.plugin-failed', formatId, reason: describeThrown(thrown) });
  }
}

function guardDocumentFormat(
  manifest: PluginManifest,
  plugin: DocumentFormat,
): RegisteredDocumentFormat {
  const id = manifest.id;
  return {
    kind: 'document',
    manifest,
    detect: (files) => guardAsync(id, async () => ok(await plugin.detect(files))),
    open: async (context) => {
      const layout = await guardAsync(id, () => plugin.open(context));
      if (!layout.ok) return layout;
      const inner = layout.value;
      return ok({
        locales: inner.locales,
        listSourceDocuments: () => guardAsync(id, () => inner.listSourceDocuments()),
        targetPathFor: (document, target) => guard(id, () => inner.targetPathFor(document, target)),
        sourceLinkTarget: (target, locale) =>
          guard(id, () => ok(inner.sourceLinkTarget?.(target, locale) ?? target)),
      });
    },
  };
}

function guardCatalogFormat(
  manifest: PluginManifest,
  plugin: CatalogFormat,
): RegisteredCatalogFormat {
  const id = manifest.id;
  return {
    kind: 'catalog',
    manifest,
    detect: (files) => guardAsync(id, async () => ok(await plugin.detect(files))),
    open: async (context) => {
      const layout = await guardAsync(id, () => plugin.open(context));
      if (!layout.ok) return layout;
      const inner: CatalogLayout = layout.value;
      return ok({
        locales: inner.locales,
        listCatalogs: () => guardAsync(id, () => inner.listCatalogs()),
        targetPathFor: (catalog, locale) => guard(id, () => inner.targetPathFor(catalog, locale)),
      });
    },
    parse: (text) => guard(id, () => plugin.parse(text)),
    serialize: (edit) => guard(id, () => plugin.serialize(edit)),
    scanPlaceholders: (text) => guard(id, () => ok(plugin.placeholders.scan(text))),
  };
}

/**
 * Validates and creates every plugin. Fails with all problems at once (bad manifests, duplicate
 * ids, a plugin whose kind doesn't match its manifest, a factory that throws), because a broken
 * plugin set is a bug to fix before the app starts, not something to half-run with.
 */
export function createFormatRegistry(
  modules: readonly PluginModule[],
  host: PluginHost,
): Result<FormatRegistry, RegistryError> {
  const problems: RegistryProblem[] = [];
  const registered = new Map<string, RegisteredFormat>();

  for (const module of modules) {
    const parsed = parsePluginManifest(module.manifest);
    if (!parsed.ok) {
      problems.push({
        ...(parsed.error.pluginId === undefined ? {} : { pluginId: parsed.error.pluginId }),
        problem: 'manifest-invalid',
        detail: parsed.error.problems.map((p) => `${p.field}: ${p.problem}`).join('; '),
      });
      continue;
    }
    const manifest = parsed.value;
    if (registered.has(manifest.id)) {
      problems.push({
        pluginId: manifest.id,
        problem: 'duplicate-id',
        detail: 'another plugin has this id',
      });
      continue;
    }

    let plugin: FormatPlugin;
    try {
      plugin = module.create(host);
    } catch (thrown) {
      problems.push({
        pluginId: manifest.id,
        problem: 'create-failed',
        detail: describeThrown(thrown),
      });
      continue;
    }

    if (plugin.kind !== manifest.kind) {
      problems.push({
        pluginId: manifest.id,
        problem: 'kind-mismatch',
        detail: `the manifest says "${manifest.kind}" but create() returned a "${plugin.kind}" plugin`,
      });
      continue;
    }
    // The plugin API has no optional capabilities yet, so there's nothing to check yet. When one is
    // added (with its method), check here that a plugin declaring it implements it:
    // problem 'missing-capability'.

    registered.set(
      manifest.id,
      plugin.kind === 'document'
        ? guardDocumentFormat(manifest, plugin)
        : guardCatalogFormat(manifest, plugin),
    );
  }

  if (problems.length > 0) return err({ code: 'formats.registry-invalid', problems });

  const all = [...registered.values()].sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1));
  return ok({
    documentFormats: all.filter((format) => format.kind === 'document'),
    catalogFormats: all.filter((format) => format.kind === 'catalog'),
    find: (id) => registered.get(id),
    detect: async (files) => {
      const results = await Promise.all(
        all.map(async (format) => ({ format, detection: await format.detect(files) })),
      );
      const matches: DetectedFormat[] = [];
      const failures: FormatError[] = [];
      for (const { format, detection } of results) {
        if (!detection.ok) failures.push(detection.error);
        else if (detection.value.matches) {
          matches.push({
            format,
            confidence: detection.value.confidence,
            evidence: detection.value.evidence,
          });
        }
      }
      matches.sort((a, b) =>
        compareMatches(
          { id: a.format.manifest.id, confidence: a.confidence },
          { id: b.format.manifest.id, confidence: b.confidence },
        ),
      );
      return { matches, failures };
    },
  });
}
