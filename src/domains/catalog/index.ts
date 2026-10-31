// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `catalog` domain: message catalogs, messages, documentation (`qqq`), and
// placeholder/plural validation. Other domains import this file only, as `#domains/catalog`.
export { catalogKey, type CatalogKey, type InvalidCatalogKey } from './domain/catalog-key.ts';
export {
  messageKey,
  type InvalidMessageKey,
  type Message,
  type MessageKey,
} from './domain/message.ts';
export {
  comparedValue,
  type PlaceholderKind,
  type PlaceholderToken,
} from './domain/placeholder.ts';
export {
  pairCatalog,
  type CatalogMessage,
  type CatalogMessages,
} from './domain/catalog-messages.ts';
export {
  checkMessage,
  type Brackets,
  type MessageWarning,
  type ScannedText,
} from './domain/message-check.ts';
