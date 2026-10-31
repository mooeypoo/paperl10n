// SPDX-License-Identifier: GPL-3.0-or-later
import { documentKey, type SourceDocument } from '#domains/document';
import { localeId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { err, ok } from '#kernel/result';
import type { Detection } from '../domain/detection.ts';
import type { DocumentFormat, DocumentLayout } from '../application/ports/document-format.ts';
import type { PluginModule } from '../application/ports/plugin-module.ts';

/** A valid manifest for a test plugin. */
export function fakeManifest(id: string): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id,
    packageName: `@paperl10n/${id}`,
    kind: id.startsWith('format-') ? 'document' : 'catalog',
    apiVersion: 3,
    version: '0.0.0',
    displayName: `Fake ${id}`,
    description: 'A fake plugin for tests',
    license: 'GPL-3.0-or-later',
    author: { name: 'Tests' },
    builtIn: true,
    capabilities: [],
    externalDependencies: [],
  };
}

/**
 * A document plugin for tests. By default it never detects, and its layout is folder-per-locale:
 * sources are `<sourceLocale>/**.md`, targets `<target>/<key>.md`. Its `locales` are the source
 * and `otherLocales`, each in its own folder. Override any method.
 */
export function fakeDocumentPlugin(
  id: string,
  overrides: Partial<DocumentFormat> = {},
  otherLocales: readonly string[] = [],
): PluginModule {
  const format: DocumentFormat = {
    kind: 'document',
    detect: () => Promise.resolve<Detection>({ matches: false }),
    open: (context) => {
      const sourceFolder = projectPath(context.sourceLocale);
      if (!sourceFolder.ok)
        return Promise.resolve(err({ code: 'formats.unsupported-project', reason: 'bad locale' }));
      const layout: DocumentLayout = {
        locales: [
          { locale: context.sourceLocale, folder: sourceFolder.value },
          ...otherLocales.flatMap((raw) => {
            const locale = localeId(raw);
            const folder = projectPath(raw);
            return locale.ok && folder.ok ? [{ locale: locale.value, folder: folder.value }] : [];
          }),
        ],
        listSourceDocuments: async () => {
          const listed = await context.files.list(sourceFolder.value, { extensions: ['.md'] });
          if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
          const documents: SourceDocument[] = [];
          for (const path of listed.value) {
            const key = documentKey(path.slice(sourceFolder.value.length + 1, -'.md'.length));
            if (!key.ok) return err({ code: 'formats.unsupported-project', reason: path });
            documents.push({ key: key.value, path, locale: context.sourceLocale });
          }
          return ok(documents);
        },
        targetPathFor: (document, target) => {
          const path = projectPath(`${target}/${document.key}.md`);
          return path.ok ? path : err({ code: 'formats.unsupported-project', reason: 'bad path' });
        },
      };
      return Promise.resolve(ok(layout));
    },
    ...overrides,
  };
  return { manifest: fakeManifest(id), create: () => format };
}

/** Detection overrides for `fakeDocumentPlugin` and `fakeCatalogPlugin`. */
export function detects(
  confidence: 'certain' | 'likely' | 'fallback',
): Pick<DocumentFormat, 'detect'> {
  return { detect: () => Promise.resolve<Detection>({ matches: true, confidence, evidence: [] }) };
}
