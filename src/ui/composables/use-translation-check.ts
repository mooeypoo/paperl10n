// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, PaperLionApi, TranslationCheckDto } from '#ipc-contract';
import { computed, onBeforeUnmount, shallowRef, watch, type ComputedRef, type Ref } from 'vue';

export interface TranslationCheckState {
  /** The open page's latest check: its preservation hints and both lengths (`null`: none yet). */
  readonly check: ComputedRef<TranslationCheckDto | null>;
  /** Checks the translation again once typing pauses (it changed, or a new editor showed it). */
  refresh(): void;
}

/**
 * Checks the open page's translation, as it's written, against its source (docs/domains/
 * translation.md): when the page opens and each time its text changes, after a pause. Information
 * only: a check that fails is just not shown, and an answer for an older text or another page is
 * dropped.
 */
export function useTranslationCheck(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  pair: Readonly<Ref<DocumentPairDto | null>>,
  /** The translation editor's text now, or `null` when there's no editor. */
  currentText: () => string | null,
  options: { readonly delay?: number } = {},
): TranslationCheckState {
  const latest = shallowRef<{ readonly key: string; readonly check: TranslationCheckDto } | null>(
    null,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Counts requests, so only the newest one's answer is kept. */
  let asked = 0;

  async function run(): Promise<void> {
    timer = undefined;
    const opened = pair.value;
    const project = projectId.value;
    const text = currentText();
    if (opened === null || project === null || text === null) return;
    const request = ++asked;
    try {
      const result = await client.checkTranslation({ projectId: project, key: opened.key, text });
      if (request !== asked || pair.value !== opened || !result.ok) return;
      latest.value = { key: opened.key, check: result.value };
    } catch {
      // Hints are information: a failed check leaves the last one (or none) showing.
    }
  }

  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), options.delay ?? 400);
  };

  // A page opening shows its editor on the next render: check it right after.
  watch(pair, () => {
    clearTimeout(timer);
    asked++;
    latest.value = null;
    if (pair.value !== null) timer = setTimeout(() => void run(), 0);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
  });

  return {
    check: computed(() =>
      latest.value !== null && latest.value.key === pair.value?.key ? latest.value.check : null,
    ),
    refresh,
  };
}
