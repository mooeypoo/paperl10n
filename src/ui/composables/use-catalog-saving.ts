// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogMessageDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { MessageEdits } from './use-message-edits';

/** What the catalog says about saving. */
export type CatalogSaveStatus = 'clean' | 'unsaved' | 'saving' | 'saved';

export interface CatalogSaving {
  readonly status: ComputedRef<CatalogSaveStatus>;
  /** The last save's or keep's error (cleared by the next that works, and another catalog). */
  readonly error: ShallowRef<ErrorDto | null>;
  /** Saved, but not recorded as up to date: why. */
  readonly statusProblem: ShallowRef<ErrorDto | null>;
  /** Saves every edited message; true when nothing is left unsaved. Failures stay in `error`. */
  save(): Promise<boolean>;
  /** Keeps an outdated message's translation as up to date with its source as shown. */
  keep(message: CatalogMessageDto): Promise<void>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * Saving the open catalog's edits (docs/plan/M4-catalogs.md, question 8) and keeping its outdated
 * messages as up to date. After either works, `onChanged` reads what changed again (the rows'
 * statuses, the sidebar's progress).
 */
export function useCatalogSaving(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  catalog: Readonly<Ref<string | null>>,
  edits: MessageEdits,
  options: { readonly onChanged: () => void },
): CatalogSaving {
  const saving = ref(false);
  const justSaved = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  const statusProblem = shallowRef<ErrorDto | null>(null);

  watch([projectId, catalog], () => {
    justSaved.value = false;
    error.value = null;
    statusProblem.value = null;
  });

  async function run<T>(
    request: () => Promise<
      { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorDto }
    >,
  ): Promise<T | null> {
    try {
      const result = await request();
      if (!result.ok) {
        error.value = result.error;
        return null;
      }
      error.value = null;
      return result.value;
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      error.value = transportFailed;
      return null;
    }
  }

  async function save(): Promise<boolean> {
    const project = projectId.value;
    const key = catalog.value;
    const messages = edits.pending();
    if (messages.length === 0) return true;
    if (project === null || key === null || saving.value) return false;
    saving.value = true;
    const saved = await run(() =>
      client.saveCatalog({ projectId: project, catalog: key, messages }),
    );
    saving.value = false;
    if (saved === null || catalog.value !== key) return false;
    edits.saved(messages);
    statusProblem.value = saved.statusProblem;
    justSaved.value = true;
    options.onChanged();
    return edits.count.value === 0;
  }

  async function keep(message: CatalogMessageDto): Promise<void> {
    const project = projectId.value;
    const key = catalog.value;
    if (project === null || key === null) return;
    const kept = await run(() =>
      client.keepMessagesUpToDate({
        projectId: project,
        catalog: key,
        messages: [{ key: message.key, source: message.source }],
      }),
    );
    if (kept !== null && catalog.value === key) options.onChanged();
  }

  return {
    status: computed(() => {
      if (saving.value) return 'saving';
      if (edits.count.value > 0) return 'unsaved';
      return justSaved.value ? 'saved' : 'clean';
    }),
    error,
    statusProblem,
    save,
    keep,
  };
}
