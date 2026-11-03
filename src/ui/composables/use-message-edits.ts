// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  MessageSaveDto,
  PlaceholderTokenDto,
} from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue';

/** A translation as a row shows it: its text, and the tokens main found in it. */
export interface ShownTranslation {
  readonly text: string;
  readonly tokens: readonly PlaceholderTokenDto[];
}

export interface MessageEdits {
  /** The open message's key (`null`: none open). */
  readonly open: Ref<string | null>;
  /** How many messages have edits (removals included). */
  readonly count: ComputedRef<number>;
  /** Counts the translator's own changes (editing, removing, keeping a removed message), not
   * resets, saves, or restores: what a draft should follow. */
  readonly changes: Ref<number>;
  /** A message's translation as it's being written: its edit, else the file's (`''`: none). */
  textOf(message: CatalogMessageDto): string;
  /** A plural message's forms as they're being written (its edit's, else the file's), `count` of
   * them (missing ones empty). */
  formsOf(message: CatalogMessageDto, count: number): string[];
  isEdited(key: string): boolean;
  /**
   * Records a message's text as written, with the translation and source it started from (kept
   * from its first edit, for the save's conflict check and recording). The file's own text is no
   * edit.
   */
  edit(message: CatalogMessageDto, text: string): void;
  /** Records a plural message's forms as written, as `edit` does its text (the first form is its
   * text). Forms that say what the file does are no edit. */
  editForms(message: CatalogMessageDto, forms: readonly string[]): void;
  /** Remembers the tokens main found in a message's text, for its row. */
  remember(key: string, text: string, tokens: readonly PlaceholderTokenDto[]): void;
  /** The translation a row shows (its edit, if any), with tokens when known; `null`: none. */
  shown(message: CatalogMessageDto): ShownTranslation | null;
  /** Every edit, as saving takes it, in the order they were first made. */
  pending(): MessageSaveDto[];
  /**
   * Forgets the edits that were saved. One that changed again since (typed during the save)
   * stays, starting from the saved text now (the file has it).
   */
  saved(messages: readonly MessageSaveDto[]): void;
  /** Forgets every edit (they were dropped). */
  discard(): void;
  /** Takes a restored draft's edits as the catalog's (replacing any). */
  restore(messages: readonly MessageSaveDto[]): void;
  /** Removes a message the source no longer has (`text`: its translation in the file). */
  remove(key: string, text: string): void;
  /** Keeps a message `remove` marked for removal. */
  unremove(key: string): void;
}

/**
 * The open catalog's edits, kept while it's open: each message's text as written (with the
 * translation and source it started from), and which message is open. Another catalog starts
 * with none.
 */
export function useMessageEdits(detail: Readonly<Ref<CatalogDetailDto | null>>): MessageEdits {
  const open = ref<string | null>(null);
  const edits = shallowRef<ReadonlyMap<string, MessageSaveDto>>(new Map());
  const tokens = shallowRef<ReadonlyMap<string, ShownTranslation>>(new Map());
  const changes = ref(0);
  const changed = (next: ReadonlyMap<string, MessageSaveDto>) => {
    edits.value = next;
    changes.value++;
  };

  watch(
    () => detail.value?.key,
    () => {
      open.value = null;
      edits.value = new Map();
      tokens.value = new Map();
    },
  );

  const textOf = (message: CatalogMessageDto) =>
    edits.value.get(message.key)?.text ?? message.translation ?? '';
  /** The file's forms of a message (none: an untranslated or a single message). */
  const fileForms = (message: CatalogMessageDto) =>
    message.translationForms?.map((form) => form.text) ?? null;
  const sameForms = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((form, index) => form === b[index]);

  return {
    open,
    count: computed(() => edits.value.size),
    changes,
    textOf,
    isEdited: (key) => edits.value.has(key),
    formsOf: (message, count) => {
      const forms = edits.value.get(message.key)?.forms ?? fileForms(message) ?? [];
      return Array.from({ length: Math.max(count, forms.length) }, (_, i) => forms[i] ?? '');
    },
    editForms: (message, forms) => {
      const next = new Map(edits.value);
      const started = edits.value.get(message.key);
      const inFile = fileForms(message);
      const asInFile =
        inFile === null ? forms.every((form) => form === '') : sameForms(forms, inFile);
      if (asInFile) next.delete(message.key);
      else {
        next.set(message.key, {
          key: message.key,
          text: forms[0] ?? '',
          forms: [...forms],
          base: started?.base ?? message.translation,
          baseForms: started === undefined ? inFile : (started.baseForms ?? null),
          source: started?.source ?? message.source,
        });
      }
      changed(next);
    },
    edit: (message, text) => {
      const next = new Map(edits.value);
      const started = edits.value.get(message.key);
      if (text === (message.translation ?? '')) next.delete(message.key);
      else {
        next.set(message.key, {
          key: message.key,
          text,
          base: started?.base ?? message.translation,
          source: started?.source ?? message.source,
        });
      }
      changed(next);
    },
    remember: (key, text, found) => {
      tokens.value = new Map(tokens.value).set(key, { text, tokens: found });
    },
    shown: (message) => {
      const edited = edits.value.get(message.key)?.text;
      if (edited === undefined) {
        return message.translation === null
          ? null
          : { text: message.translation, tokens: message.translationTokens };
      }
      if (edited === '') return null;
      const known = tokens.value.get(message.key);
      return { text: edited, tokens: known?.text === edited ? known.tokens : [] };
    },
    pending: () => [...edits.value.values()],
    saved: (messages) => {
      const next = new Map(edits.value);
      for (const { key, text, forms } of messages) {
        const now = next.get(key);
        if (now === undefined) continue;
        const same = now.text === text && sameForms(now.forms ?? [], forms ?? []);
        if (same) next.delete(key);
        else {
          // Typed into during the save: still an edit, starting from what was saved.
          const emptied = forms === undefined || forms.every((form) => form === '');
          next.set(key, {
            ...now,
            base: text === '' ? null : text,
            ...(now.forms === undefined ? {} : { baseForms: emptied ? null : forms }),
          });
        }
      }
      edits.value = next;
    },
    discard: () => {
      edits.value = new Map();
    },
    restore: (messages) => {
      edits.value = new Map(messages.map((message) => [message.key, message]));
    },
    remove: (key, text) => {
      changed(new Map(edits.value).set(key, { key, text: '', base: text, source: null }));
    },
    unremove: (key) => {
      const next = new Map(edits.value);
      next.delete(key);
      changed(next);
    },
  };
}
