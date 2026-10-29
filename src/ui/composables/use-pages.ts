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
 * The Pages sidebar: searching and selecting documents. When another project opens, the search
 * clears and the first document is selected. When the same project's list changes (a page gets its
 * first translation, the target language changes), the search and the selection stay, if the
 * selected page is still listed.
 */
export function usePages(
  documents: Readonly<Ref<readonly SourceDocumentDto[]>>,
  projectId: Readonly<Ref<string | null>>,
): Pages {
  const query = ref('');
  const selectedKey = ref<string | null>(documents.value[0]?.key ?? null);
  watch([documents, projectId], ([list, project], [, previousProject]) => {
    const sameProject = project === previousProject;
    if (sameProject && list.some((document) => document.key === selectedKey.value)) return;
    if (!sameProject) query.value = '';
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
