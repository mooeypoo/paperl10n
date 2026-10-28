// SPDX-License-Identifier: GPL-3.0-or-later
// Types only in M0: just enough for the CatalogFormat contract sketch. Behavior arrives in M4.
import type { Brand } from '#kernel/brand';

/** A message's key in a catalog, e.g. `paperl10n-open-folder`. */
export type MessageKey = Brand<string, 'MessageKey'>;

/** One message in one locale's catalog. */
export interface Message {
  readonly key: MessageKey;
  readonly text: string;
}
