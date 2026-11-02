<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { CatalogDto, ErrorDto, PageStatusDto, SourceDocumentDto } from '#ipc-contract';
import { computed } from 'vue';
import { errorMessage } from '../i18n/error-message';
import { useI18n } from '../i18n/i18n';
import AppIcon from './AppIcon.vue';

const props = withDefaults(
  defineProps<{
    /** Whether the project has pages (a document format): the "Pages" group shows only then. */
    showPages?: boolean;
    documents: readonly SourceDocumentDto[];
    matches: readonly SourceDocumentDto[];
    /** The project's message catalogs; `null` when it has none: the "Messages" group hides. */
    catalogs?: readonly CatalogDto[] | null;
    /** The catalog shown in the main area, if any (a page is shown otherwise). */
    selectedCatalog?: string | null;
    selectedKey: string | null;
    /** The page whose translation has unsaved changes, if any. */
    unsavedKey: string | null;
    /** Offer to mark every existing translation up to date (the one-time start). */
    offerExisting?: boolean;
    /** Marking them is on its way. */
    markingExisting?: boolean;
    markExistingError?: ErrorDto | null;
    /** How many pages marking existing translations marked, once it did. */
    markedExisting?: number | null;
  }>(),
  {
    showPages: true,
    catalogs: null,
    selectedCatalog: null,
    offerExisting: false,
    markingExisting: false,
    markExistingError: null,
    markedExisting: null,
  },
);
const query = defineModel<string>('query', { required: true });
const emit = defineEmits<{
  select: [key: string];
  selectCatalog: [key: string];
  markExisting: [];
  dismissExisting: [];
}>();
const { t } = useI18n();
const count = (status: PageStatusDto) =>
  props.documents.filter((document) => document.status === status).length;
const existing = computed(() => props.documents.filter((d) => d.targetExists).length);
const statusNames: Readonly<Record<PageStatusDto, string>> = {
  missing: 'paperl10n-status-missing',
  draft: 'paperl10n-status-draft',
  translated: 'paperl10n-status-translated',
  outdated: 'paperl10n-status-outdated',
};
const unsaved = (document: SourceDocumentDto) =>
  document.key === props.unsavedKey || document.hasDraft;

/** Every readable catalog's messages, and how many are up to date. */
const messages = computed(() => {
  let total = 0;
  let translated = 0;
  for (const catalog of props.catalogs ?? []) {
    total += catalog.progress?.total ?? 0;
    translated += catalog.progress?.byStatus.translated ?? 0;
  }
  return { total, translated };
});
/** The project's progress: its pages', its messages', or both, for the kinds it has. */
const progress = computed(() => {
  const pages = props.showPages && props.documents.length > 0;
  const catalogs = props.catalogs !== null && messages.value.total > 0;
  if (pages && catalogs) {
    return t(
      'paperl10n-progress-both',
      count('translated'),
      props.documents.length,
      messages.value.translated,
      messages.value.total,
    );
  }
  if (pages) return t('paperl10n-pages-up-to-date', count('translated'), props.documents.length);
  if (catalogs) {
    return t('paperl10n-messages-up-to-date', messages.value.translated, messages.value.total);
  }
  return null;
});
</script>

<template>
  <nav class="pages" :aria-label="t('paperl10n-sidebar')">
    <p v-if="progress !== null" class="pages-progress">{{ progress }}</p>
    <template v-if="showPages">
      <div class="pages-heading">
        <h2>{{ t('paperl10n-pages') }}</h2>
        <span class="pages-count">
          {{
            query.trim() === ''
              ? t('paperl10n-documents-count', documents.length)
              : t('paperl10n-pages-matching', matches.length, documents.length)
          }}
        </span>
      </div>
      <p v-if="count('outdated') > 0" class="pages-progress">
        {{ t('paperl10n-pages-outdated', count('outdated')) }}
      </p>
      <div v-if="offerExisting && existing > 0" class="pages-existing">
        <p>{{ t('paperl10n-mark-existing-prompt', existing) }}</p>
        <p v-if="markExistingError !== null" class="pages-existing-error" role="alert">
          {{ errorMessage(markExistingError, t) }}
        </p>
        <div class="pages-existing-actions">
          <button
            type="button"
            class="pl-button"
            data-variant="primary"
            :disabled="markingExisting"
            @click="emit('markExisting')"
          >
            {{ t('paperl10n-mark-existing') }}
          </button>
          <button type="button" class="pl-button" @click="emit('dismissExisting')">
            {{ t('paperl10n-mark-existing-later') }}
          </button>
        </div>
      </div>
      <p v-if="markedExisting !== null" class="pages-progress" role="status">
        {{ t('paperl10n-mark-existing-done', markedExisting) }}
      </p>
      <label class="pages-search">
        <span class="visually-hidden">{{ t('paperl10n-find-page') }}</span>
        <AppIcon name="search" :size="16" />
        <input v-model="query" type="search" :placeholder="t('paperl10n-find-page-placeholder')" />
      </label>
      <ul v-if="matches.length > 0" class="pages-list">
        <li v-for="document in matches" :key="document.key">
          <button
            type="button"
            class="pages-item"
            :aria-current="document.key === selectedKey ? 'page' : undefined"
            @click="emit('select', document.key)"
          >
            <span class="pages-status" :data-status="document.status" aria-hidden="true"></span>
            <!-- A key is a path, not prose in the interface language: isolate it. -->
            <bdi>{{ document.key }}</bdi>
            <span class="visually-hidden">{{ t(statusNames[document.status]) }}</span>
            <span v-if="unsaved(document)" class="pages-unsaved" aria-hidden="true"></span>
            <span v-if="unsaved(document)" class="visually-hidden">
              {{ t('paperl10n-status-unsaved') }}
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="pages-none">{{ t('paperl10n-no-matching-pages', query.trim()) }}</p>
    </template>
    <template v-if="catalogs !== null">
      <div class="pages-heading">
        <h2>{{ t('paperl10n-messages') }}</h2>
        <span class="pages-count">{{ t('paperl10n-catalogs-count', catalogs.length) }}</span>
      </div>
      <ul v-if="catalogs.length > 0" class="pages-list">
        <li v-for="catalog in catalogs" :key="catalog.key">
          <button
            type="button"
            class="pages-item catalogs-item"
            :aria-current="catalog.key === selectedCatalog ? 'page' : undefined"
            @click="emit('selectCatalog', catalog.key)"
          >
            <!-- A key is a folder or a name, not prose in the interface language: isolate it. -->
            <bdi>{{ catalog.key }}</bdi>
            <span v-if="catalog.progress !== null" class="catalogs-progress">
              {{
                t(
                  'paperl10n-catalog-up-to-date',
                  catalog.progress.byStatus.translated,
                  catalog.progress.total,
                )
              }}
              <template v-if="catalog.progress.byStatus.outdated > 0">
                · {{ t('paperl10n-catalog-outdated', catalog.progress.byStatus.outdated) }}
              </template>
            </span>
            <span v-if="catalog.problem !== null" class="catalogs-problem">
              {{ errorMessage(catalog.problem, t) }}
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="pages-none">{{ t('paperl10n-no-catalogs') }}</p>
    </template>
    <ul class="pages-legend" aria-hidden="true">
      <li v-for="(name, status) in statusNames" :key="status">
        <span class="pages-status" :data-status="status"></span>{{ t(name) }}
      </li>
      <li v-if="unsavedKey !== null || documents.some((document) => document.hasDraft)">
        <span class="pages-unsaved"></span>{{ t('paperl10n-status-unsaved') }}
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.pages {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
  padding: var(--pl-space-4);
  border-inline-end: 1px solid var(--pl-color-line);
  background: var(--pl-color-bar);
}

.pages-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--pl-space-2);
}

.pages-heading h2 {
  margin: 0;
  font-size: var(--pl-text-md);
  font-weight: 600;
}

.pages-count,
.pages-none,
.pages-progress {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.pages-progress p {
  margin: 0;
}

.pages-existing {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  padding: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  font-size: var(--pl-text-sm);
}

.pages-existing p {
  margin: 0;
}

.pages-existing-error {
  color: var(--pl-color-danger);
}

.pages-existing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-2);
}

.pages-search {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  color: var(--pl-color-muted);
}

.pages-search:focus-within {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 1px;
}

.pages-search input {
  flex: 1 1 auto;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  color: var(--pl-color-ink);
  outline: none;
}

.pages-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pages-item {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  inline-size: 100%;
  padding-block: var(--pl-space-2);
  padding-inline: var(--pl-space-3);
  border: 0;
  border-inline-start: 3px solid transparent;
  border-radius: var(--pl-radius-md);
  background: transparent;
  color: var(--pl-color-ink);
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}

.pages-item:hover {
  background: var(--pl-color-chip);
}

.pages-item[aria-current='page'] {
  border-inline-start-color: var(--pl-color-accent);
  background: var(--pl-color-chip);
}
/* Unsaved changes: a small accent dot at the end of the row, beside the status. */
.pages-unsaved {
  flex: none;
  inline-size: 0.4rem;
  block-size: 0.4rem;
  margin-inline-start: auto;
  border-radius: 50%;
  background: var(--pl-color-accent);
}

.pages-legend .pages-unsaved {
  margin-inline: 0.05rem;
}

.catalogs-item {
  flex-direction: column;
  align-items: stretch;
  gap: var(--pl-space-1);
}

.catalogs-progress,
.catalogs-problem {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 400;
}

.catalogs-problem {
  color: var(--pl-color-danger);
}

.pages-legend {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
  margin: 0;
  margin-block-start: auto;
  padding: 0;
  list-style: none;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.pages-legend li {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
}
</style>
