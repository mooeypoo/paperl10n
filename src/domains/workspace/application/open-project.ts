// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  FileAccessError,
  FormatError,
  FormatRegistry,
  ProjectFiles,
  RegisteredDocumentFormat,
} from '#domains/formats';
import { localeFrom, type Locale } from '#domains/locale';
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
import type { ProjectSessions } from './ports/project-sessions.ts';

export interface ProjectSummary {
  readonly projectId: ProjectId;
  readonly name: string;
  readonly sourceLocale: Locale;
  readonly targetLocale: Locale;
  readonly documentFormat: { readonly id: string; readonly displayName: string };
  readonly warnings: readonly string[];
}

export type OpenProjectError =
  | FolderUnavailable
  | { readonly code: 'workspace.config-missing' }
  | { readonly code: 'workspace.config-unreadable'; readonly cause: FileAccessError }
  | InvalidConfig
  | { readonly code: 'workspace.unknown-document-format'; readonly formatId: string }
  | { readonly code: 'workspace.no-document-format'; readonly failures: readonly FormatError[] }
  | FormatError;

export interface OpenProjectDependencies {
  readonly folderPicker: FolderPicker;
  readonly opener: ProjectFilesOpener;
  readonly registry: FormatRegistry;
  readonly sessions: ProjectSessions;
}

export type OpenProject = () => Promise<Result<ProjectSummary | null, OpenProjectError>>;

/**
 * Asks for a folder, reads its config, chooses the document format, and opens it.
 * Format choice: a format pinned in the config wins; otherwise the best-ranked detection.
 * `null` means the user cancelled the folder picker.
 */
export function createOpenProject(deps: OpenProjectDependencies): OpenProject {
  return async () => {
    const folder = await deps.folderPicker.pick();
    if (folder === null) return ok(null);

    const opened = await deps.opener.open(folder);
    if (!opened.ok) return opened;
    const { files, name } = opened.value;

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

    const format = await chooseDocumentFormat(deps.registry, files, config);
    if (!format.ok) return format;

    const layout = await format.value.open({
      files,
      sourceLocale: config.sourceLocale,
      options: config.formatOptions[format.value.manifest.id] ?? {},
    });
    if (!layout.ok) return layout;

    const project = {
      name,
      files,
      config,
      sourceLocale: localeFrom(config.sourceLocale),
      targetLocale: localeFrom(config.targetLocale),
      documentFormat: format.value,
      layout: layout.value,
    };
    const projectId = deps.sessions.add(project);
    return ok({
      projectId,
      name,
      sourceLocale: project.sourceLocale,
      targetLocale: project.targetLocale,
      documentFormat: {
        id: format.value.manifest.id,
        displayName: format.value.manifest.displayName,
      },
      warnings,
    });
  };
}

async function chooseDocumentFormat(
  registry: FormatRegistry,
  files: ProjectFiles,
  config: ProjectConfig,
): Promise<Result<RegisteredDocumentFormat, OpenProjectError>> {
  if (config.documentFormat !== undefined) {
    const pinned = registry.find(config.documentFormat);
    return pinned?.kind === 'document'
      ? ok(pinned)
      : err({ code: 'workspace.unknown-document-format', formatId: config.documentFormat });
  }
  const report = await registry.detect(files);
  const best = report.matches.find((match) => match.format.kind === 'document')?.format;
  return best?.kind === 'document'
    ? ok(best)
    : err({ code: 'workspace.no-document-format', failures: report.failures });
}
