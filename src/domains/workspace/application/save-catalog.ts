// SPDX-License-Identifier: GPL-3.0-or-later
// Saving a catalog's edited messages (docs/plan/M4-catalogs.md, questions 3 and 8): the format
// patches the target file, changing only those messages, and each saved translation is recorded
// as up to date with the source the translator saw.
import { messageKey } from '#domains/catalog';
import type { MessageChange } from '#domains/formats';
import type { RecordedMessage } from '#domains/translation';
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

/** One edited message to save. */
export interface MessageSave {
  readonly key: string;
  /** The translation to write; empty removes the message from the file. */
  readonly text: string;
  /** Its translation as read when editing started (`null`: none). Saving refuses if the file no
   * longer has it. */
  readonly base: string | null;
  /** The source text the translator saw (`null`: the source didn't have it). */
  readonly source: string | null;
}

export interface SaveCatalogResult {
  readonly path: ProjectPath;
  /** `false`: the file already said all that, and wasn't touched. */
  readonly written: boolean;
  /** Each saved message's status now, in the request's order. */
  readonly messages: readonly SavedMessage[];
  /** Why the saved messages couldn't be recorded as up to date (the translation is saved). */
  readonly statusProblem: StatusReadError | StatusWriteError | null;
}

export type SaveCatalogError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-message'; readonly catalog: string; readonly key: string }
  /** Messages changed on disk since editing started: saving would overwrite someone's work. */
  | {
      readonly code: 'workspace.catalog-changed';
      readonly path: ProjectPath;
      readonly keys: readonly string[];
    }
  | { readonly code: 'workspace.catalog-unwritable'; readonly cause: FileWriteError }
  | FindCatalogError
  | CatalogReadError;

export type SaveCatalog = (
  projectId: string,
  request: { readonly catalog: string; readonly messages: readonly MessageSave[] },
) => Promise<Result<SaveCatalogResult, SaveCatalogError>>;

/**
 * Saves a catalog's edited messages for the project's target language. The format patches the
 * target file (or writes a new one shaped like the source), so every other byte stays; nothing is
 * written when nothing changes. A message that changed on disk since editing started is never
 * overwritten (`workspace.catalog-changed`, naming them); other changes on disk are kept.
 *
 * Each saved translation is recorded as up to date, unless the source changed since the
 * translator saw it (then its status shows that); a removed one loses its record. The status file
 * is the record of the work, not the work: when it can't be read or written, the translation is
 * still saved, and `statusProblem` says why.
 */
export function createSaveCatalog(deps: {
  readonly sessions: ProjectSessions;
  readonly updates: StatusUpdates;
}): SaveCatalog {
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

    const changes: MessageChange[] = [];
    for (const message of messages) {
      const key = messageKey(message.key);
      if (!key.ok) {
        return err({ code: 'workspace.unknown-message', catalog: catalogKey, key: message.key });
      }
      changes.push(
        message.text === ''
          ? { kind: 'remove', key: key.value }
          : { kind: 'set', key: key.value, text: message.text },
      );
    }

    // One save of a file at a time: each reads the file the last one wrote.
    const saved = await deps.updates.run(`${project.location}\n${path.value}`, async () => {
      const source = await readParsedCatalog(project, format, catalog.path);
      if (!source.ok) return source;
      if (source.value === null)
        return err({ code: 'workspace.unknown-catalog' as const, key: catalogKey });
      const target = await readParsedCatalog(project, format, path.value);
      if (!target.ok) return target;

      const changed = messages
        .filter((message) => translationIn(target.value, message.key) !== message.base)
        .map((message) => message.key);
      if (changed.length > 0) {
        return err({ code: 'workspace.catalog-changed' as const, path: path.value, keys: changed });
      }
      const nothingToWrite = target.value === null && messages.every((m) => m.text === '');
      const text = nothingToWrite
        ? ok(null)
        : format.serialize({ source: source.value, target: target.value, changes });
      if (!text.ok) return text;
      if (text.value === null || text.value === target.value?.text) {
        return ok({ source: source.value.messages, written: false });
      }
      const written = await project.writer.writeText(path.value, text.value, {
        createFolders: true,
      });
      if (!written.ok) {
        return err({ code: 'workspace.catalog-unwritable' as const, cause: written.error });
      }
      return ok({ source: source.value.messages, written: true });
    });
    if (!saved.ok) return saved;

    // A removed message loses its record; a saved one is recorded against the source now, only
    // where that's what the translator saw.
    const source = saved.value.source;
    const recorded = await recordMessages(
      deps.updates,
      project,
      locale.id,
      catalog.key,
      messages.flatMap((message): RecordedMessage[] => {
        const now = sourceOf(source, message.key);
        if (message.text === '') return [{ key: message.key, source: '', translation: null }];
        return now !== null && now === message.source
          ? [{ key: message.key, source: now, translation: message.text }]
          : [];
      }),
    );
    const now = new Map(messages.map((message) => [message.key, message.text]));
    const translation = (key: string) => now.get(key) ?? null;
    return ok({
      path: path.value,
      written: saved.value.written,
      messages: statusesOf(
        messages.map((message) => message.key),
        source,
        translation,
        recorded.ok ? recorded.value : undefined,
      ),
      statusProblem: recorded.ok ? null : recorded.error,
    });
  };
}
