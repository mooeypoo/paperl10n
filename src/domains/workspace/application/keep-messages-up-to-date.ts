// SPDX-License-Identifier: GPL-3.0-or-later
// "Keep as up to date" for messages (docs/plan/M4-catalogs.md, question 3): an outdated message
// whose source changed in a way its translation doesn't need to follow is recorded as up to date
// with the source as it is now. The catalog is touched only to clear a translation's review mark
// (gettext's `fuzzy`): its file says it needs review, and the translator has reviewed it.
import type { FormatError, MessageChange } from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import {
  recordMessages,
  sourceOf,
  statusesOf,
  translationIn,
  type SavedMessage,
  type StatusWriteError,
} from './catalog-records.ts';
import { readParsedCatalog, type CatalogReadError } from './catalog-files.ts';
import { findCatalog, type FindCatalogError } from './find-catalog.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';
import type { FileWriteError } from './ports/project-writer.ts';
import type { StatusReadError, StatusUpdates } from './translation-status.ts';

/** A message to keep: its key, and the source text the translator saw. */
export interface MessageToKeep {
  readonly key: string;
  readonly source: string;
}

export type KeepMessagesError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  /** The source on disk isn't the one the translator saw: show it before keeping. */
  | { readonly code: 'workspace.source-changed'; readonly path: ProjectPath }
  | FindCatalogError
  | { readonly code: 'workspace.catalog-unwritable'; readonly cause: FileWriteError }
  | CatalogReadError
  | FormatError
  | StatusReadError
  | StatusWriteError;

export type KeepMessagesUpToDate = (
  projectId: string,
  request: { readonly catalog: string; readonly messages: readonly MessageToKeep[] },
) => Promise<Result<readonly SavedMessage[], KeepMessagesError>>;

/**
 * Records messages' translations as up to date with their source as it is now, and returns their
 * status after. Refused when a message's source isn't the text the translator saw (or is gone),
 * so a version they haven't read is never kept; and when the status file can't be read (it's
 * never overwritten then). A message without a translation has nothing to keep, and stays missing.
 * A kept translation its file marks as needing review loses that mark in the file first (the
 * format writes it back as it is, which clears the mark); nothing is recorded if that fails.
 */
export function createKeepMessagesUpToDate(deps: {
  readonly sessions: ProjectSessions;
  readonly updates: StatusUpdates;
}): KeepMessagesUpToDate {
  return async (projectId, { catalog: catalogKey, messages }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const locale = project.targetLocale;
    if (locale === null) return err({ code: 'workspace.no-target-locale' });
    const found = await findCatalog(project, catalogKey);
    if (!found.ok) return found;
    const { catalog, format, layout } = found.value;
    const path = layout.targetPathFor(catalog, locale.id);
    if (!path.ok) return path;

    const source = await readParsedCatalog(project, format, catalog.path, 'source');
    if (!source.ok) return source;
    const sourceMessages = source.value?.messages ?? [];
    if (messages.some((message) => sourceOf(sourceMessages, message.key) !== message.source)) {
      return err({ code: 'workspace.source-changed', path: catalog.path });
    }
    const target = await readParsedCatalog(project, format, path.value, 'target');
    if (!target.ok) return target;
    const translation = (key: string) => translationIn(target.value, key);

    // Reviewed: each kept translation its file marks as needing review, set to itself.
    const kept = new Set(messages.map((message) => message.key));
    const reviewed: MessageChange[] = (target.value?.messages ?? []).flatMap((message) =>
      kept.has(message.key) && message.needsReview === true
        ? [
            {
              kind: 'set',
              key: message.key,
              text: message.text,
              ...(message.forms === undefined ? {} : { forms: message.forms }),
            },
          ]
        : [],
    );
    if (reviewed.length > 0 && target.value !== null && source.value !== null) {
      const parsed = { source: source.value, target: target.value };
      const cleared = await deps.updates.run(`${project.location}\n${path.value}`, async () => {
        const text = format.serialize({ locale: locale.id, ...parsed, changes: reviewed });
        if (!text.ok) return text;
        const written = await project.writer.writeText(path.value, text.value, {
          createFolders: false,
        });
        return written.ok
          ? ok(undefined)
          : err({ code: 'workspace.catalog-unwritable' as const, cause: written.error });
      });
      if (!cleared.ok) return cleared;
    }

    const recorded = await recordMessages(
      deps.updates,
      project,
      locale.id,
      catalog.key,
      // Without a translation there's nothing to keep: its record (if any) goes.
      messages.map((message) => ({
        key: message.key,
        source: message.source,
        translation: translation(message.key),
      })),
    );
    if (!recorded.ok) return recorded;
    return ok(
      statusesOf(
        messages.map((message) => message.key),
        sourceMessages,
        translation,
        recorded.value,
      ),
    );
  };
}
