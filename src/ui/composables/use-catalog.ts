// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogDetailDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';

export interface CatalogState {
  readonly detail: ShallowRef<CatalogDetailDto | null>;
  readonly error: ShallowRef<ErrorDto | null>;
  readonly loading: Ref<boolean>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * The selected catalog's messages. Reads again when the project or the catalog changes; only the
 * newest request may update the state, so a slow read can't replace a newer catalog.
 */
export function useCatalog(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  key: Readonly<Ref<string | null>>,
): CatalogState {
  const detail = shallowRef<CatalogDetailDto | null>(null);
  const error = shallowRef<ErrorDto | null>(null);
  const loading = ref(false);
  let latest = 0;

  async function load(project: string | null, catalog: string | null): Promise<void> {
    const request = ++latest;
    if (project === null || catalog === null) {
      detail.value = null;
      error.value = null;
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const result = await client.readCatalog({ projectId: project, key: catalog });
      if (request !== latest) return;
      detail.value = result.ok ? result.value : null;
      error.value = result.ok ? null : result.error;
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      if (request === latest) {
        detail.value = null;
        error.value = transportFailed;
      }
    } finally {
      if (request === latest) loading.value = false;
    }
  }

  watch([projectId, key], ([project, catalog]) => void load(project, catalog), {
    immediate: true,
  });
  return { detail, error, loading };
}
