// SPDX-License-Identifier: GPL-3.0-or-later
import type { ErrorDto, LanguageDto, PaperLionApi } from '#ipc-contract';
import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { UiEnvironment } from '../environment';
import { recentLanguages } from '../preferences';

/** The picker's sections: before typing, the suggestions; while typing, the results. */
export interface PickerSection {
  readonly id: 'inProject' | 'recent' | 'suggested' | 'results';
  readonly languages: readonly LanguageDto[];
}

export interface LanguagePickerState {
  readonly query: Ref<string>;
  readonly sections: ShallowRef<readonly PickerSection[]>;
  /** Every language shown, in order: what the arrow keys move through. */
  readonly options: ComputedRef<readonly LanguageDto[]>;
  readonly loading: Ref<boolean>;
  readonly error: ShallowRef<ErrorDto | null>;
  /** Asks again for what `query` calls for. Only the newest answer is shown. */
  refresh(): Promise<void>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

export function useLanguagePicker(
  client: PaperLionApi,
  projectId: Ref<string | null>,
  uiLanguage: Ref<string>,
  environment: UiEnvironment,
): LanguagePickerState {
  const query = ref('');
  const sections = shallowRef<readonly PickerSection[]>([]);
  const loading = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  let latest = 0;

  async function refresh(): Promise<void> {
    const id = projectId.value;
    if (id === null) return;
    const request = ++latest;
    const text = query.value.trim();
    loading.value = true;
    try {
      if (text === '') {
        const suggested = await client.suggestTargetLanguages({
          projectId: id,
          recent: recentLanguages(environment.preferences),
          systemLanguages: [...environment.systemLanguages],
          uiLanguage: uiLanguage.value,
        });
        if (request !== latest) return;
        if (!suggested.ok) {
          error.value = suggested.error;
          sections.value = [];
          return;
        }
        error.value = null;
        sections.value = (['inProject', 'recent', 'suggested'] as const)
          .map((section) => ({ id: section, languages: suggested.value[section] }))
          .filter((section) => section.languages.length > 0);
      } else {
        const found = await client.searchTargetLanguages({
          projectId: id,
          query: text,
          uiLanguage: uiLanguage.value,
        });
        if (request !== latest) return;
        error.value = found.ok ? null : found.error;
        sections.value = found.ok ? [{ id: 'results', languages: found.value }] : [];
      }
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      if (request === latest) error.value = transportFailed;
    } finally {
      if (request === latest) loading.value = false;
    }
  }

  const options = computed(() => sections.value.flatMap((section) => section.languages));
  return { query, sections, options, loading, error, refresh };
}
