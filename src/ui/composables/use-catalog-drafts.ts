// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogDetailDto, ErrorDto, MessageSaveDto, PaperLionApi } from '#ipc-contract';
import { onScopeDispose, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import type { MessageEdits } from './use-message-edits';

export interface CatalogDrafts {
  /** Say that the catalog opened with a draft from an earlier session (until it's saved or
   * discarded). */
  readonly restoredNotice: Ref<boolean>;
  /** Some restored messages changed on disk since the draft started: saving them is refused. */
  readonly restoredFromOlder: Ref<boolean>;
  /** Keeping the draft failed (the edits are still here). */
  readonly error: ShallowRef<ErrorDto | null>;
  /** Drops the restored draft and its edits: the catalog shows the file again. */
  discardRestored(): Promise<void>;
  /** Forgets the catalog's draft (leaving it without saving). */
  discard(): Promise<void>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/** A restored message whose file translation isn't what its edit started from anymore. */
function changedSince(detail: CatalogDetailDto, messages: readonly MessageSaveDto[]): boolean {
  const inFile = new Map<string, string | null>([
    ...detail.messages.map((message) => [message.key, message.translation] as const),
    ...detail.notInSource.map((message) => [message.key, message.text] as const),
  ]);
  return messages.some((message) => (inFile.get(message.key) ?? null) !== message.base);
}

/**
 * The open catalog's draft (docs/domains/workspace.md, "Catalog drafts"): its edits kept in
 * main as they're made, after a pause, and restored when the catalog opens with one. Only the
 * translator's changes are kept, never a reset, so opening another catalog can't overwrite its
 * draft.
 */
export function useCatalogDrafts(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  catalog: Readonly<Ref<string | null>>,
  detail: Readonly<Ref<CatalogDetailDto | null>>,
  edits: MessageEdits,
  options: {
    /** A catalog gained or lost its draft (for the sidebar). */
    readonly onDraftChange: (key: string, hasDraft: boolean) => void;
    /** How long changes must pause before the draft is kept, in milliseconds. */
    readonly delay?: number;
  },
): CatalogDrafts {
  const restoredNotice = ref(false);
  const restoredFromOlder = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The catalog whose draft was already looked at since it opened. */
  let restoredFor: string | null = null;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  watch([projectId, catalog], () => {
    cancel();
    restoredFor = null;
    restoredNotice.value = false;
    restoredFromOlder.value = false;
    error.value = null;
  });

  // The first read of a catalog brings its draft; reading it again (after a save) doesn't.
  // After the edits' own reset for a new catalog (`flush: 'post'`).
  watch(
    detail,
    (read) => {
      if (read === null || read.key !== catalog.value || restoredFor === read.key) return;
      restoredFor = read.key;
      // (Edits from before this read were reset with the new catalog.)
      if (read.draft === null) return;
      edits.restore(read.draft.messages);
      restoredNotice.value = true;
      restoredFromOlder.value = changedSince(read, read.draft.messages);
    },
    { flush: 'post' },
  );

  // Every edit saved (or dropped): nothing restored is left to mention.
  watch(edits.count, (count) => {
    if (count === 0) restoredNotice.value = false;
  });

  async function keep(project: string, key: string): Promise<void> {
    timer = undefined;
    const messages = edits.pending();
    try {
      const kept = await client.saveCatalogDraft({ projectId: project, catalog: key, messages });
      if (!kept.ok) {
        error.value = kept.error;
        return;
      }
      error.value = null;
      options.onDraftChange(key, messages.length > 0);
    } catch {
      error.value = transportFailed;
    }
  }

  watch(edits.changes, () => {
    const project = projectId.value;
    const key = catalog.value;
    cancel();
    if (project === null || key === null) return;
    timer = setTimeout(() => void keep(project, key), options.delay ?? 800);
  });
  onScopeDispose(cancel);

  async function discard(): Promise<void> {
    cancel();
    const project = projectId.value;
    const key = catalog.value;
    if (project === null || key === null) return;
    try {
      const forgotten = await client.discardCatalogDraft({ projectId: project, catalog: key });
      if (forgotten.ok) options.onDraftChange(key, false);
    } catch {
      // Not forgotten: reading the catalog again drops what the file already says.
    }
  }

  return {
    restoredNotice,
    restoredFromOlder,
    error,
    discardRestored: async () => {
      await discard();
      edits.discard();
      restoredNotice.value = false;
    },
    discard,
  };
}
