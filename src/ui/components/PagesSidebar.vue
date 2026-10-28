<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { SourceDocumentDto } from '#ipc-contract';
import { computed } from 'vue';
import { useI18n } from '../i18n/i18n';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  documents: readonly SourceDocumentDto[];
  matches: readonly SourceDocumentDto[];
  selectedKey: string | null;
}>();
const query = defineModel<string>('query', { required: true });
const emit = defineEmits<{ select: [key: string] }>();
const { t } = useI18n();
const withTranslation = computed(() => props.documents.filter((d) => d.targetExists).length);
</script>

<template>
  <nav class="pages" :aria-label="t('paperl10n-pages')">
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
    <p v-if="documents.length > 0" class="pages-progress">
      {{ t('paperl10n-pages-with-translation', withTranslation, documents.length) }}
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
          <span
            class="pages-status"
            :data-status="document.targetExists ? 'started' : 'missing'"
            aria-hidden="true"
          ></span>
          <!-- A key is a path, not prose in the interface language: isolate it. -->
          <bdi>{{ document.key }}</bdi>
          <span class="visually-hidden">
            {{
              document.targetExists ? t('paperl10n-status-started') : t('paperl10n-status-missing')
            }}
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="pages-none">{{ t('paperl10n-no-matching-pages', query.trim()) }}</p>
    <ul class="pages-legend" aria-hidden="true">
      <li>
        <span class="pages-status" data-status="started"></span>{{ t('paperl10n-status-started') }}
      </li>
      <li>
        <span class="pages-status" data-status="missing"></span>{{ t('paperl10n-status-missing') }}
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
.pages-status {
  flex: none;
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border: 2px solid var(--pl-color-muted);
  border-radius: 50%;
}

.pages-status[data-status='started'] {
  background: var(--pl-color-muted);
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
