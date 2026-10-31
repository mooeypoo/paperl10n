// SPDX-License-Identifier: GPL-3.0-or-later
// Message status (docs/plan/M4-catalogs.md, question 3). A catalog's record keeps, for each
// recorded message, the fingerprint of its source text when its translation was saved (or kept
// as up to date). Unlike a page's sections, saving a message's translation records it: a message
// is short, and saving it usually means it's done.
import { blockFingerprint } from './fingerprint.ts';

export type MessageStatus =
  /** The source has it; the translation doesn't (or has it empty). */
  | 'missing'
  /** Translated, and never recorded (an existing translation, before it's saved or kept). */
  | 'draft'
  /** Recorded, and the source text is unchanged since. */
  | 'translated'
  /** Recorded, and the source text changed since. */
  | 'outdated';

/** A catalog's record: each recorded message's source fingerprint, by message key. */
export type CatalogRecord = ReadonlyMap<string, string>;

/** The fingerprint a message's record keeps: as a block's, ignoring line endings and trailing
 * whitespace on each line. */
export function messageFingerprint(source: string): string {
  return blockFingerprint(source);
}

/** A source message's status, from its translation (`null`: none) and its recorded fingerprint. */
export function messageStatus(
  source: string,
  translation: string | null,
  recorded: string | undefined,
): MessageStatus {
  if (translation === null || translation === '') return 'missing';
  if (recorded === undefined) return 'draft';
  return recorded === messageFingerprint(source) ? 'translated' : 'outdated';
}

/** A message as it's being recorded: its source text, and the translation being saved. */
export interface RecordedMessage {
  readonly key: string;
  readonly source: string;
  /** `null` or empty: the translation was removed. */
  readonly translation: string | null;
}

/**
 * The catalog's record after saving these messages (or keeping them as up to date): each one
 * with a translation is recorded against its source as it is now; one without loses its record.
 * Other messages keep theirs.
 */
export function recordMessages(
  record: CatalogRecord | undefined,
  messages: readonly RecordedMessage[],
): CatalogRecord {
  const next = new Map(record);
  for (const { key, source, translation } of messages) {
    if (translation === null || translation === '') next.delete(key);
    else next.set(key, messageFingerprint(source));
  }
  return next;
}
