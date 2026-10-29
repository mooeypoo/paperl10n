// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';

export interface DocumentPairState {
  readonly pair: ShallowRef<DocumentPairDto | null>;
  readonly error: ShallowRef<ErrorDto | null>;
  readonly loading: Ref<boolean>;
  /** Reads the page again (its files changed on disk). */
  reload(): void;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * The selected page's source and translation. Reloads when the project or the page changes; only
 * the newest request may update the state, so a slow read can't replace a newer page.
 */
export function useDocumentPair(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  key: Readonly<Ref<string | null>>,
): DocumentPairState {
  const pair = shallowRef<DocumentPairDto | null>(null);
  const error = shallowRef<ErrorDto | null>(null);
  const loading = ref(false);
  let latest = 0;

  async function load(project: string | null, page: string | null): Promise<void> {
    const request = ++latest;
    if (project === null || page === null) {
      pair.value = null;
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const result = await client.readDocumentPair({ projectId: project, key: page });
      if (request !== latest) return;
      pair.value = result.ok ? result.value : null;
      error.value = result.ok ? null : result.error;
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      if (request === latest) {
        pair.value = null;
        error.value = transportFailed;
      }
    } finally {
      if (request === latest) loading.value = false;
    }
  }

  watch([projectId, key], ([project, page]) => void load(project, page), { immediate: true });
  return { pair, error, loading, reload: () => void load(projectId.value, key.value) };
}
