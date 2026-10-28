// SPDX-License-Identifier: GPL-3.0-or-later
import type { SourceDocumentDto } from '#ipc-contract';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export interface Pages {
  /** What the user typed in "Find a page". */
  readonly query: Ref<string>;
  /** Documents whose key or paths contain every word of the query, in the project's order. */
  readonly matches: ComputedRef<readonly SourceDocumentDto[]>;
  readonly selectedKey: Ref<string | null>;
  readonly selected: ComputedRef<SourceDocumentDto | null>;
}

function matchesQuery(document: SourceDocumentDto, words: readonly string[]): boolean {
  const haystack = `${document.key} ${document.sourcePath} ${document.targetPath}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * The Pages sidebar: searching and selecting documents. When the document list changes (a project
 * opens), the search clears and the first document is selected.
 */
export function usePages(documents: Readonly<Ref<readonly SourceDocumentDto[]>>): Pages {
  const query = ref('');
  const selectedKey = ref<string | null>(documents.value[0]?.key ?? null);
  watch(documents, (list) => {
    query.value = '';
    selectedKey.value = list[0]?.key ?? null;
  });
  const matches = computed(() => {
    const words = query.value
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== '');
    return documents.value.filter((document) => matchesQuery(document, words));
  });
  const selected = computed(
    () => documents.value.find((document) => document.key === selectedKey.value) ?? null,
  );
  return { query, matches, selectedKey, selected };
}
