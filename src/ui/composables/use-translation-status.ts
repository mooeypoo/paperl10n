// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, DocumentStatusDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';

export interface TranslationStatusState {
  /** The open page's status: as it opened, then as marking (or saving it first) changed it. */
  readonly status: ComputedRef<DocumentStatusDto | null>;
  /** A mark is on its way. */
  readonly marking: Ref<boolean>;
  /** Why the last mark failed, until the page changes or a mark succeeds. */
  readonly error: ShallowRef<ErrorDto | null>;
  /** Marks the whole page up to date with the source it showed. */
  markPage(): Promise<void>;
  /** Marks one source section (by its index among the source's sections) up to date. */
  markSection(index: number): Promise<void>;
  /** The page's first save created its translation file: from `missing`, it's a draft now. */
  noteSaved(key: string): void;
  /** These pages were marked up to date elsewhere (marking all existing translations). */
  noteMarked(keys: readonly string[]): void;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * The open page's status (docs/domains/translation.md), and marking it up to date. A mark is
 * written to the status file right away (never on save); `onMarked` passes the page's status on
 * (to the page list).
 */
export function useTranslationStatus(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  pair: Readonly<Ref<DocumentPairDto | null>>,
  onMarked: (key: string, status: DocumentStatusDto) => void,
): TranslationStatusState {
  /** What changed since the page opened, for that page only. */
  const changed = shallowRef<{ readonly key: string; readonly status: DocumentStatusDto } | null>(
    null,
  );
  const marking = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  watch(pair, () => {
    changed.value = null;
    error.value = null;
  });

  const status = computed((): DocumentStatusDto | null => {
    const opened = pair.value;
    if (opened === null) return null;
    if (changed.value?.key === opened.key) return changed.value.status;
    const { page, sections, changes } = opened.status;
    return { page, sections, changes };
  });

  async function mark(sections: readonly number[] | null): Promise<void> {
    const opened = pair.value;
    const project = projectId.value;
    if (opened === null || project === null || marking.value) return;
    marking.value = true;
    error.value = null;
    try {
      const result = await client.markUpToDate({
        projectId: project,
        key: opened.key,
        sourceFingerprint: opened.status.sourceFingerprint,
        sections,
      });
      // Another page opened meanwhile: the mark stands, but this view isn't it any more.
      if (pair.value !== opened) return;
      if (!result.ok) {
        error.value = result.error;
        return;
      }
      changed.value = { key: opened.key, status: result.value };
      onMarked(opened.key, result.value);
    } catch {
      if (pair.value === opened) error.value = transportFailed;
    } finally {
      marking.value = false;
    }
  }

  return {
    status,
    marking,
    error,
    markPage: () => mark(null),
    markSection: (index) => mark([index]),
    noteSaved: (key) => {
      const current = status.value;
      if (pair.value?.key !== key || current?.page !== 'missing') return;
      changed.value = { key, status: { ...current, page: 'draft' } };
    },
    noteMarked: (keys) => {
      const current = status.value;
      const key = pair.value?.key;
      if (current === null || key === undefined || !keys.includes(key)) return;
      changed.value = {
        key,
        // The page had no record, so nothing in its source had changed: nor does it now.
        status: {
          page: 'translated',
          sections: current.sections.map(() => 'translated'),
          changes: { blocks: [], removals: [] },
        },
      };
    },
  };
}
