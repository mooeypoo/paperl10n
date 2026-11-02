// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogDetailDto, CatalogMessageDto, PlaceholderTokenDto } from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue';

/** A translation as a row shows it: its text, and the tokens main found in it. */
export interface ShownTranslation {
  readonly text: string;
  readonly tokens: readonly PlaceholderTokenDto[];
}

export interface MessageEdits {
  /** The open message's key (`null`: none open). */
  readonly open: Ref<string | null>;
  /** How many messages have edits. */
  readonly count: ComputedRef<number>;
  /** A message's translation as it's being written: its edit, else the file's (`''`: none). */
  textOf(message: CatalogMessageDto): string;
  isEdited(key: string): boolean;
  /** Records a message's text as written; the file's own text is no edit. */
  edit(message: CatalogMessageDto, text: string): void;
  /** Remembers the tokens main found in a message's text, for its row. */
  remember(key: string, text: string, tokens: readonly PlaceholderTokenDto[]): void;
  /** The translation a row shows (its edit, if any), with tokens when known; `null`: none. */
  shown(message: CatalogMessageDto): ShownTranslation | null;
}

/**
 * The open catalog's edits, kept while it's open: each message's text as written, and which
 * message is open. Another catalog starts with none. (Saving them is M4's step C7.)
 */
export function useMessageEdits(detail: Readonly<Ref<CatalogDetailDto | null>>): MessageEdits {
  const open = ref<string | null>(null);
  const edits = shallowRef<ReadonlyMap<string, string>>(new Map());
  const tokens = shallowRef<ReadonlyMap<string, ShownTranslation>>(new Map());

  watch(
    () => detail.value?.key,
    () => {
      open.value = null;
      edits.value = new Map();
      tokens.value = new Map();
    },
  );

  const textOf = (message: CatalogMessageDto) =>
    edits.value.get(message.key) ?? message.translation ?? '';

  return {
    open,
    count: computed(() => edits.value.size),
    textOf,
    isEdited: (key) => edits.value.has(key),
    edit: (message, text) => {
      const next = new Map(edits.value);
      if (text === (message.translation ?? '')) next.delete(message.key);
      else next.set(message.key, text);
      edits.value = next;
    },
    remember: (key, text, found) => {
      tokens.value = new Map(tokens.value).set(key, { text, tokens: found });
    },
    shown: (message) => {
      const edited = edits.value.get(message.key);
      if (edited === undefined) {
        return message.translation === null
          ? null
          : { text: message.translation, tokens: message.translationTokens };
      }
      if (edited === '') return null;
      const known = tokens.value.get(message.key);
      return { text: edited, tokens: known?.text === edited ? known.tokens : [] };
    },
  };
}
