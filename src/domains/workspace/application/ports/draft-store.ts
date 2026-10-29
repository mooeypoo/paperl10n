// SPDX-License-Identifier: GPL-3.0-or-later
import type { Result } from '#kernel/result';

/** Which draft: a page's translation into one language, in one project. */
export interface DraftKey {
  /** The project's lasting identity (`OpenedProject.location`), the same after a restart. */
  readonly project: string;
  /** The target locale's id. */
  readonly locale: string;
  /** The page's document key. */
  readonly document: string;
}

/** Unsaved edits to a translation, kept outside the project until they're saved or discarded. */
export interface Draft {
  /** The editor's text, exactly (as it would be saved). */
  readonly text: string;
  /** The translation as it was when editing started, or `null` for a new one (see saveDocument). */
  readonly base: string | null;
}

export interface DraftStoreError {
  readonly code: 'drafts.unavailable';
}

/**
 * Where drafts live: the app's own data, never the project (M2 decision). Behavior:
 * `describeDraftStoreContract`.
 */
export interface DraftStore {
  /** The draft for `key`, or `null` when there's none (or it can't be read as a draft). */
  get(key: DraftKey): Promise<Result<Draft | null, DraftStoreError>>;
  /** Keeps `draft` for `key`, replacing any earlier one. */
  put(key: DraftKey, draft: Draft): Promise<Result<void, DraftStoreError>>;
  /** Forgets the draft for `key`; nothing to forget is fine. */
  remove(key: DraftKey): Promise<Result<void, DraftStoreError>>;
  /** The document keys with a draft, for one project and locale, in no particular order. */
  documents(project: string, locale: string): Promise<Result<readonly string[], DraftStoreError>>;
}
