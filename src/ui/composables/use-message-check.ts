// SPDX-License-Identifier: GPL-3.0-or-later
import type { MessageCheckDto, PaperLionApi } from '#ipc-contract';
import { computed, onScopeDispose, shallowRef, watch, type ComputedRef, type Ref } from 'vue';

/** Main's check of the open message: the text it checked, its tokens, and the warnings. */
export interface MessageCheckAnswer extends MessageCheckDto {
  readonly key: string;
  readonly text: string;
}

export interface MessageCheckState {
  /** The open message's latest check (`null`: none yet since it opened). It may be for an older
   * text: answers come after a pause. */
  readonly check: ComputedRef<MessageCheckAnswer | null>;
  /** Checks the text again once typing pauses. */
  refresh(): void;
}

/**
 * Checks the open message's translation, as it's written, in main (docs/plan/M4-catalogs.md,
 * question 6): when it opens, and each time its text changes, after a pause. Information only: a
 * check that fails is just not shown, and an answer for another message or an older request is
 * dropped.
 */
export function useMessageCheck(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  catalog: Readonly<Ref<string | null>>,
  open: Readonly<Ref<string | null>>,
  /** The open message's text now, or `null` when none is open. */
  currentText: () => string | null,
  options: { readonly delay?: number } = {},
): MessageCheckState {
  const latest = shallowRef<MessageCheckAnswer | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Counts requests, so only the newest one's answer is kept. */
  let asked = 0;

  async function run(): Promise<void> {
    timer = undefined;
    const project = projectId.value;
    const catalogKey = catalog.value;
    const key = open.value;
    const text = currentText();
    if (project === null || catalogKey === null || key === null || text === null) return;
    const request = ++asked;
    try {
      const result = await client.checkMessage({
        projectId: project,
        catalog: catalogKey,
        key,
        text,
      });
      if (request !== asked || !result.ok) return;
      latest.value = { key, text, ...result.value };
    } catch {
      // Warnings are information: a failed check leaves the last one (or none) showing.
    }
  }

  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), options.delay ?? 200);
  };

  // Another message (or catalog) opening is checked right away, on the next turn.
  watch([projectId, catalog, open], () => {
    clearTimeout(timer);
    asked++;
    latest.value = null;
    if (open.value !== null) timer = setTimeout(() => void run(), 0);
  });
  onScopeDispose(() => {
    clearTimeout(timer);
  });

  return { check: computed(() => latest.value), refresh };
}
