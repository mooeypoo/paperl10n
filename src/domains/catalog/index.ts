// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `catalog` domain: message catalogs, messages, documentation (`qqq`), and
// placeholder/plural validation. Other domains import this file only, as `#domains/catalog`.
// Messages and their keys so far; status and validation arrive with M4's C3.
export {
  messageKey,
  type InvalidMessageKey,
  type Message,
  type MessageKey,
} from './domain/message.ts';
