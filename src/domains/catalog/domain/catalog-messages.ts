// SPDX-License-Identifier: GPL-3.0-or-later
// A catalog for one target language: each source message with its documentation and translation,
// and the translation's messages the source no longer has (PRD §7.3, docs/domains/catalog.md).
import type { Message, MessageKey } from './message.ts';

/** A source message, as a translator works on it. */
export interface CatalogMessage {
  readonly key: MessageKey;
  /** The source text (its first form, when it has plural forms). */
  readonly source: string;
  /** Every plural form of the source (gettext's `msgid` and `msgid_plural`); `null`: none. */
  readonly sourceForms: readonly string[] | null;
  /** What the developers say about it: the documentation file's (`qqq`), else the source
   * message's own (gettext's `#.`); `null`: nothing. */
  readonly documentation: string | null;
  /** The target's text (its first form, which may be empty when a later form isn't); `null`: the
   * target doesn't have it, or has it empty (every form empty, for one with plural forms). */
  readonly translation: string | null;
  /** Every plural form of the translation; `null`: no translation, or none kept apart. */
  readonly translationForms: readonly string[] | null;
  /** The target marks the translation as needing review (gettext's `fuzzy`). */
  readonly needsReview: boolean;
  /** The source the translation was made for, when the target keeps it (gettext's `#|`). */
  readonly previousSource: string | null;
}

export interface CatalogMessages {
  /** In source order. */
  readonly messages: readonly CatalogMessage[];
  /** The target's messages whose keys the source doesn't have, in the target's order. */
  readonly notInSource: readonly Message[];
}

const nonEmpty = (text: string | undefined): string | null =>
  text === undefined || text === '' ? null : text;

/** Whether a message has a translation: text, or a plural form that isn't empty. */
const translated = (message: Message | undefined): message is Message =>
  message !== undefined &&
  (message.text !== '' || (message.forms ?? []).some((form) => form !== ''));

/**
 * Pairs a catalog's files by key. `target` and `documentation` are `null` when the file doesn't
 * exist. Documentation for keys the source doesn't have is ignored. A documentation file says
 * more than a message's own notes, so it wins where it has something to say.
 */
export function pairCatalog(
  source: readonly Message[],
  target: readonly Message[] | null,
  documentation: readonly Message[] | null,
): CatalogMessages {
  const translations = new Map((target ?? []).map((m) => [m.key, m]));
  const docs = new Map((documentation ?? []).map((m) => [m.key, m.text]));
  const inSource = new Set(source.map((m) => m.key));
  return {
    messages: source.map((message) => {
      const found = translations.get(message.key);
      const translation = translated(found) ? found : undefined;
      return {
        key: message.key,
        source: message.text,
        sourceForms: message.forms ?? null,
        documentation: nonEmpty(docs.get(message.key)) ?? nonEmpty(message.documentation),
        translation: translation?.text ?? null,
        translationForms: translation?.forms ?? null,
        needsReview: translation?.needsReview === true,
        previousSource:
          translation?.needsReview === true ? (translation.previousSource ?? null) : null,
      };
    }),
    notInSource: (target ?? []).filter((m) => !inSource.has(m.key)),
  };
}
