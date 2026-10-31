// SPDX-License-Identifier: GPL-3.0-or-later
// A message and its key: what the CatalogFormat contract carries. The rest of the catalog model
// (status, validation) arrives with M4's C3.
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

/** One message in one locale's catalog. */
export interface Message {
  readonly key: MessageKey;
  readonly text: string;
}
