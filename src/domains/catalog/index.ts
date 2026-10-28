// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `catalog` domain: message catalogs, messages, documentation (`qqq`), and
// placeholder/plural validation. Other domains import this file only, as `#domains/catalog`.
// Types only in M0; behavior arrives in M4.
export type { Message, MessageKey } from './domain/message.ts';
