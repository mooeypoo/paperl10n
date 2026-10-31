// SPDX-License-Identifier: GPL-3.0-or-later
// A catalog for one target language: each source message with its documentation and translation,
// and the translation's messages the source no longer has (PRD §7.3, docs/domains/catalog.md).
import type { Message, MessageKey } from './message.ts';

/** A source message, as a translator works on it. */
export interface CatalogMessage {
  readonly key: MessageKey;
  readonly source: string;
  /** What the documentation (`qqq`) says about it; `null`: nothing. */
  readonly documentation: string | null;
  /** The target's text; `null`: the target doesn't have it, or has it empty. */
  readonly translation: string | null;
}

export interface CatalogMessages {
  /** In source order. */
  readonly messages: readonly CatalogMessage[];
  /** The target's messages whose keys the source doesn't have, in the target's order. */
  readonly notInSource: readonly Message[];
}

const nonEmpty = (text: string | undefined): string | null =>
  text === undefined || text === '' ? null : text;

/**
 * Pairs a catalog's files by key. `target` and `documentation` are `null` when the file doesn't
 * exist. Documentation for keys the source doesn't have is ignored.
 */
export function pairCatalog(
  source: readonly Message[],
  target: readonly Message[] | null,
  documentation: readonly Message[] | null,
): CatalogMessages {
  const translations = new Map((target ?? []).map((m) => [m.key, m.text]));
  const docs = new Map((documentation ?? []).map((m) => [m.key, m.text]));
  const inSource = new Set(source.map((m) => m.key));
  return {
    messages: source.map((message) => ({
      key: message.key,
      source: message.text,
      documentation: nonEmpty(docs.get(message.key)),
      translation: nonEmpty(translations.get(message.key)),
    })),
    notInSource: (target ?? []).filter((m) => !inSource.has(m.key)),
  };
}
