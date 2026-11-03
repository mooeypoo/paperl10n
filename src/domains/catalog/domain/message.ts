// SPDX-License-Identifier: GPL-3.0-or-later
// A message and its key: what the CatalogFormat contract carries.
import type { Brand } from '#kernel/brand';
import { err, ok, type Result } from '#kernel/result';

/** A message's key in a catalog, e.g. `paperl10n-open-folder`. */
export type MessageKey = Brand<string, 'MessageKey'>;

export interface InvalidMessageKey {
  readonly code: 'message-key.invalid';
  readonly input: string;
}

/**
 * A message key: any non-empty text, as the catalog writes it. Systems allow almost anything in
 * keys (spaces, dots, slashes), so the key isn't normalized; it identifies the message as is.
 */
export function messageKey(input: string): Result<MessageKey, InvalidMessageKey> {
  if (input === '') return err({ code: 'message-key.invalid', input });
  return ok(input as MessageKey);
}

/**
 * One message in one locale's catalog. Only `key` and `text` are always there; the rest is what
 * some systems keep with a message (gettext keeps all of it, banana-i18n none).
 */
export interface Message {
  readonly key: MessageKey;
  /** The message's text; for one with plural forms, the first form. */
  readonly text: string;
  /**
   * Every plural form, when the system keeps them apart (gettext's `msgstr[0]`, `msgstr[1]`, …;
   * in a source, `msgid` and `msgid_plural`). `text` is the first. banana-i18n keeps a plural
   * inside one text (`{{PLURAL:…}}`), so its messages have no forms.
   */
  readonly forms?: readonly string[];
  /** Which use of a text this is, when the same text is used in more than one place (gettext's
   * `msgctxt`): shown with the key. */
  readonly context?: string;
  /** What the developers say about it, kept with the message (gettext's `#.` comments). */
  readonly documentation?: string;
  /** The system marks its translation as needing review (gettext's `fuzzy`). */
  readonly needsReview?: boolean;
  /** The source text the translation was made for, when the file keeps it (gettext's `#|`). */
  readonly previousSource?: string;
  /** The system's own markers on the message, which its plugin reads back (gettext's
   * `c-format`, which says what its placeholders look like). */
  readonly flags?: readonly string[];
}
