// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  FileAccessError,
  FormatError,
  FormatRegistry,
  ProjectFiles,
  RegisteredCatalogFormat,
  RegisteredDocumentFormat,
  RegisteredFormat,
} from '#domains/formats';
import { bundledLanguageCatalog, localeFrom, type Locale } from '#domains/locale';
import { projectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import {
  CONFIG_FILE_NAME,
  parseProjectConfig,
  type InvalidConfig,
  type ProjectConfig,
} from '../domain/project-config.ts';
import type { ProjectId } from '../domain/project-id.ts';
import type { FolderPicker } from './ports/folder-picker.ts';
import type { FolderUnavailable, ProjectFilesOpener } from './ports/project-files-opener.ts';
import type {
  ProjectCatalogs,
  ProjectDocuments,
  ProjectSessions,
} from './ports/project-sessions.ts';
import { projectCatalog, projectLocales } from './project-languages.ts';

/** A format as the UI names it. */
export interface FormatName {
  readonly id: string;
  readonly displayName: string;
}

export interface ProjectSummary {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly sourceLocale: Locale;
  /** `null` when the config has none yet: the user is asked to choose one. */
  readonly targetLocale: Locale | null;
  /** The format of the project's pages; `null` when it has none. */
  readonly documentFormat: FormatName | null;
  /** The format of the project's message catalogs; `null` when it has none. */
  readonly catalogFormat: FormatName | null;
  readonly warnings: readonly string[];
}

export type OpenProjectError =
  | FolderUnavailable
  | { readonly code: 'workspace.config-missing' }
  | { readonly code: 'workspace.config-unreadable'; readonly cause: FileAccessError }
  | InvalidConfig
  | { readonly code: 'workspace.unknown-document-format'; readonly formatId: string }
  | { readonly code: 'workspace.unknown-catalog-format'; readonly formatId: string }
  /** Neither a document format nor a catalog format recognizes the project. */
  | { readonly code: 'workspace.no-format'; readonly failures: readonly FormatError[] }
  | FormatError;

export interface OpenProjectDependencies {
  readonly folderPicker: FolderPicker;
  readonly opener: ProjectFilesOpener;
  readonly registry: FormatRegistry;
  readonly sessions: ProjectSessions;
}

export type OpenProject = () => Promise<Result<ProjectSummary | null, OpenProjectError>>;

/**
 * Asks for a folder, reads its config, chooses its formats, and opens it. A project has pages (a
 * document format), message catalogs (a catalog format), or both. Each format is chosen on its
 * own: one pinned in the config wins; otherwise the best-ranked detection of that kind. `null`
 * means the user cancelled the folder picker.
 */
export function createOpenProject(deps: OpenProjectDependencies): OpenProject {
  return async () => {
    const folder = await deps.folderPicker.pick();
    if (folder === null) return ok(null);

    const opened = await deps.opener.open(folder);
    if (!opened.ok) return opened;
    const { files, writer, name, location } = opened.value;

    const configPath = projectPath(CONFIG_FILE_NAME);
    if (!configPath.ok) throw new Error('CONFIG_FILE_NAME must be a valid project path');
    const text = await files.readText(configPath.value);
    if (!text.ok) {
      return text.error.code === 'files.not-found'
        ? err({ code: 'workspace.config-missing' })
        : err({ code: 'workspace.config-unreadable', cause: text.error });
    }
    const parsed = parseProjectConfig(text.value);
    if (!parsed.ok) return parsed;
    const { config, warnings } = parsed.value;

    const formats = await chooseFormats(deps.registry, files, config);
    if (!formats.ok) return formats;
    const context = (format: RegisteredFormat) => ({
      files,
      sourceLocale: config.sourceLocale,
      options: config.formatOptions[format.manifest.id] ?? {},
    });

    let documents: ProjectDocuments | null = null;
    if (formats.value.document !== null) {
      const format = formats.value.document;
      const layout = await format.open(context(format));
      if (!layout.ok) return layout;
      documents = { format, layout: layout.value };
    }
    let catalogs: ProjectCatalogs | null = null;
    if (formats.value.catalog !== null) {
      const format = formats.value.catalog;
      const layout = await format.open(context(format));
      if (!layout.ok) return layout;
      catalogs = { format, layout: layout.value };
    }

    const catalog = projectCatalog(
      bundledLanguageCatalog(),
      config,
      projectLocales(documents, catalogs),
    );
    const project = {
      name,
      location,
      files,
      writer,
      config,
      sourceLocale: localeFrom(config.sourceLocale, catalog),
      targetLocale:
        config.targetLocale === undefined ? null : localeFrom(config.targetLocale, catalog),
      catalog,
      documents,
      catalogs,
    };
    const projectId = deps.sessions.add(project);
    const named = (format: RegisteredFormat | undefined): FormatName | null =>
      format === undefined
        ? null
        : { id: format.manifest.id, displayName: format.manifest.displayName };
    return ok({
      projectId,
      name,
      sourceLocale: project.sourceLocale,
      targetLocale: project.targetLocale,
      documentFormat: named(documents?.format),
      catalogFormat: named(catalogs?.format),
      warnings,
    });
  };
}

interface ChosenFormats {
  readonly document: RegisteredDocumentFormat | null;
  readonly catalog: RegisteredCatalogFormat | null;
}

async function chooseFormats(
  registry: FormatRegistry,
  files: ProjectFiles,
  config: ProjectConfig,
): Promise<Result<ChosenFormats, OpenProjectError>> {
  let document: RegisteredDocumentFormat | null = null;
  let catalog: RegisteredCatalogFormat | null = null;
  if (config.documentFormat !== undefined) {
    const pinned = registry.find(config.documentFormat);
    if (pinned?.kind !== 'document') {
      return err({ code: 'workspace.unknown-document-format', formatId: config.documentFormat });
    }
    document = pinned;
  }
  if (config.catalogFormat !== undefined) {
    const pinned = registry.find(config.catalogFormat);
    if (pinned?.kind !== 'catalog') {
      return err({ code: 'workspace.unknown-catalog-format', formatId: config.catalogFormat });
    }
    catalog = pinned;
  }
  if (document !== null && catalog !== null) return ok({ document, catalog });

  // Matches come best first; a pinned format is already chosen, so detection never replaces it.
  const report = await registry.detect(files);
  for (const { format } of report.matches) {
    if (document === null && format.kind === 'document') document = format;
    if (catalog === null && format.kind === 'catalog') catalog = format;
  }
  return document === null && catalog === null
    ? err({ code: 'workspace.no-format', failures: report.failures })
    : ok({ document, catalog });
}
