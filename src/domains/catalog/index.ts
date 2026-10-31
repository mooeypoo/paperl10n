// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `catalog` domain: message catalogs, messages, documentation (`qqq`), and
// placeholder/plural validation. Other domains import this file only, as `#domains/catalog`.
// Catalog and message keys so far; status and validation arrive with M4's C3.
export { catalogKey, type CatalogKey, type InvalidCatalogKey } from './domain/catalog-key.ts';
export {
  messageKey,
  type InvalidMessageKey,
  type Message,
  type MessageKey,
} from './domain/message.ts';
