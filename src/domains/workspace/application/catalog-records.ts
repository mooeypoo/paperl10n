// SPDX-License-Identifier: GPL-3.0-or-later
// Recording messages as up to date in the target language's status file, shared by saving a
// catalog and keeping its messages as up to date.
import type { Message } from '#domains/catalog';
import type { ParsedCatalog } from '#domains/formats';
import {
  messageStatus,
  recordMessages as recordedCatalog,
  serializeStatusFile,
  type CatalogRecord,
  type MessageStatus,
  type RecordedMessage,
} from '#domains/translation';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';
import type { FileWriteError } from './ports/project-writer.ts';
import {
  readStatusFile,
  statusFilePath,
  type StatusReadError,
  type StatusUpdates,
} from './translation-status.ts';

/** A message's status after saving or keeping it (`null`: not in the source). */
export interface SavedMessage {
  readonly key: string;
  readonly status: MessageStatus | null;
}

export type StatusWriteError = {
  readonly code: 'workspace.status-unwritable';
  readonly cause: FileWriteError;
};

/** A message's translation in a file: its text, or `null` when it's absent or empty. */
export function translationIn(file: ParsedCatalog | null, key: string): string | null {
  const text = file?.messages.find((message) => message.key === key)?.text;
  return text === undefined || text === '' ? null : text;
}

/** A message's plural forms in a file: `null` when it has none, or every one is empty. */
export function formsIn(file: ParsedCatalog | null, key: string): readonly string[] | null {
  const forms = file?.messages.find((message) => message.key === key)?.forms;
  return forms === undefined || forms.every((form) => form === '') ? null : forms;
}

/** Two lists of forms alike (`null` alike only with `null`). */
export const sameForms = (a: readonly string[] | null, b: readonly string[] | null) =>
  a === null || b === null ? a === b : a.length === b.length && a.every((form, i) => form === b[i]);

/** Whether an edit (its text, and its forms when it has them) says what `found` does. */
export function editMatches(
  found: Message | undefined,
  edit: { readonly text: string; readonly forms?: readonly string[] },
): boolean {
  if (edit.text !== (found?.text ?? '')) return false;
  return (
    edit.forms === undefined || sameForms(edit.forms, found?.forms ?? edit.forms.map(() => ''))
  );
}

export const sourceOf = (source: readonly Message[], key: string) =>
  source.find((message) => message.key === key)?.text ?? null;

/** Each message's status after, from the source and translation now and the record. */
export function statusesOf(
  keys: readonly string[],
  source: readonly Message[],
  target: (key: string) => string | null,
  record: CatalogRecord | undefined,
): SavedMessage[] {
  return keys.map((key) => {
    const text = sourceOf(source, key);
    return {
      key,
      status: text === null ? null : messageStatus(text, target(key), record?.get(key)),
    };
  });
}

/** Two records with the same messages and fingerprints. */
const sameRecord = (a: CatalogRecord | undefined, b: CatalogRecord) =>
  (a?.size ?? 0) === b.size && [...b].every(([key, fingerprint]) => a?.get(key) === fingerprint);

/**
 * Records messages in the catalog's record and writes the status file, one change at a time per
 * file; when the record doesn't change, nothing is written. A status file that can't be read is
 * never overwritten.
 */
export async function recordMessages(
  updates: StatusUpdates,
  project: OpenedProject,
  locale: Parameters<typeof statusFilePath>[0],
  catalog: string,
  messages: readonly RecordedMessage[],
): Promise<Result<CatalogRecord | undefined, StatusReadError | StatusWriteError>> {
  const path = statusFilePath(locale);
  return updates.run(`${project.location}\n${path}`, async () => {
    const status = await readStatusFile(project, locale);
    if (!status.ok) return status;
    const before = status.value.file.catalogs.get(catalog);
    const after = recordedCatalog(before, messages);
    if (sameRecord(before, after)) return ok(before);
    const catalogs = new Map(status.value.file.catalogs).set(catalog, after);
    const file = { ...status.value.file, catalogs };
    const written = await project.writer.writeText(path, serializeStatusFile(file), {
      createFolders: true,
    });
    if (!written.ok) return err({ code: 'workspace.status-unwritable', cause: written.error });
    return ok(after);
  });
}
