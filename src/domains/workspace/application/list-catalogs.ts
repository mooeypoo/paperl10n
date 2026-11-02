// SPDX-License-Identifier: GPL-3.0-or-later
import { pairCatalog, type Message } from '#domains/catalog';
import type { FormatError } from '#domains/formats';
import { emptyStatusFile, messageStatus, type MessageStatus } from '#domains/translation';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { readCatalogFile, type CatalogReadError } from './catalog-files.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';
import { readStatusFile, type StatusReadError } from './translation-status.ts';

/** How many of a catalog's source messages have each status, and the target's extra keys. */
export interface CatalogProgress {
  /** The source's messages. */
  readonly total: number;
  readonly byStatus: Readonly<Record<MessageStatus, number>>;
  /** The target's messages the source no longer has. */
  readonly notInSource: number;
}

export interface CatalogEntry {
  readonly key: string;
  readonly sourcePath: ProjectPath;
  /** Where the target language's file lives (or will live). */
  readonly targetPath: ProjectPath;
  readonly targetExists: boolean;
  /** `null` when the source or target file can't be read; `problem` says why. */
  readonly progress: CatalogProgress | null;
  readonly problem: CatalogReadError | null;
}

export interface CatalogList {
  readonly catalogs: readonly CatalogEntry[];
  /** The target language's status file, as for pages: messages read as never recorded when it
   * can't be read. */
  readonly statusFile: { readonly exists: boolean; readonly problem: StatusReadError | null };
}

export type ListCatalogsError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | FormatError;

export type ListCatalogs = (projectId: string) => Promise<Result<CatalogList, ListCatalogsError>>;

/** Counts statuses over a catalog's paired messages. */
export function catalogProgress(
  source: readonly Message[],
  target: readonly Message[] | null,
  record: ReadonlyMap<string, string> | undefined,
): CatalogProgress {
  const paired = pairCatalog(source, target, null);
  const byStatus: Record<MessageStatus, number> = {
    missing: 0,
    draft: 0,
    translated: 0,
    outdated: 0,
  };
  for (const message of paired.messages) {
    byStatus[messageStatus(message.source, message.translation, record?.get(message.key))]++;
  }
  return { total: paired.messages.length, byStatus, notInSource: paired.notInSource.length };
}

/**
 * The open project's catalogs, each with its target file and progress in the target language.
 * A project without catalogs lists none. A catalog whose files can't be read still lists, with
 * the problem; a status file that can't be read counts as empty.
 */
export function createListCatalogs(deps: { readonly sessions: ProjectSessions }): ListCatalogs {
  return async (projectId) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const target = project.targetLocale;
    if (target === null) return err({ code: 'workspace.no-target-locale' });

    const read = await readStatusFile(project, target.id);
    const file = read.ok ? read.value.file : emptyStatusFile;
    const entries: CatalogEntry[] = [];
    if (project.catalogs !== null) {
      const { format, layout } = project.catalogs;
      const catalogs = await layout.listCatalogs();
      if (!catalogs.ok) return catalogs;
      for (const catalog of catalogs.value) {
        const targetPath = layout.targetPathFor(catalog, target.id);
        if (!targetPath.ok) return targetPath;
        const entry = {
          key: catalog.key,
          sourcePath: catalog.path,
          targetPath: targetPath.value,
          targetExists: await project.files.exists(targetPath.value),
        };
        const source = await readCatalogFile(project, format, catalog.path);
        if (!source.ok) {
          entries.push({ ...entry, progress: null, problem: source.error });
          continue;
        }
        const translation = await readCatalogFile(project, format, targetPath.value);
        if (!translation.ok) {
          entries.push({ ...entry, progress: null, problem: translation.error });
          continue;
        }
        const record = file.catalogs.get(catalog.key);
        const progress = catalogProgress(source.value ?? [], translation.value, record);
        entries.push({ ...entry, progress, problem: null });
      }
    }
    return ok({
      catalogs: entries,
      statusFile: { exists: read.ok && read.value.exists, problem: read.ok ? null : read.error },
    });
  };
}
