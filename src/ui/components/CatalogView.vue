<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { CatalogDetailDto, ErrorDto, LocaleDto, MessageStatusDto } from '#ipc-contract';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { filterMessages, type StatusFilter } from '../catalog/message-filter';
import { errorMessage } from '../i18n/error-message';
import { useI18n } from '../i18n/i18n';
import { useVirtualRows } from '../composables/use-virtual-rows';
import { autonym } from '../i18n/language-name';
import AppIcon from './AppIcon.vue';
import MessageText from './MessageText.vue';

// A catalog's messages, read-only: one row per source message (key, source, translation,
// status), with search and a status filter, and the translation's keys the source no longer has
// listed apart. Each text column carries its language and direction. Rows are a fixed height, long
// texts clamped to two lines, so only the rows in view are rendered (5,000 rows took a second).
const props = defineProps<{
  detail: CatalogDetailDto | null;
  loading: boolean;
  error: ErrorDto | null;
  sourceLocale: LocaleDto;
  targetLocale: LocaleDto;
}>();
const { t } = useI18n();

const query = ref('');
const status = ref<StatusFilter>('all');
// Another catalog starts with every message showing.
watch(
  () => props.detail?.key,
  () => {
    query.value = '';
    status.value = 'all';
  },
);
const messages = computed(() => props.detail?.messages ?? []);
const shown = computed(() => filterMessages(messages.value, query.value, status.value));

/** A row's height before one is rendered to measure: `--catalog-row-height` at 16 px per rem. */
const ROW_HEIGHT_FALLBACK = 72;
const scrollBox = useTemplateRef<HTMLElement>('scrollBox');
const rows = useVirtualRows(
  scrollBox,
  computed(() => shown.value.length),
  ROW_HEIGHT_FALLBACK,
);
const rendered = computed(() =>
  shown.value
    .slice(rows.window.value.start, rows.window.value.end)
    .map((message, offset) => ({ message, index: rows.window.value.start + offset })),
);
// Another search, filter, or catalog starts at the top.
watch(shown, async () => {
  if (scrollBox.value !== null) scrollBox.value.scrollTop = 0;
  await nextTick();
  rows.measure();
});

const statusNames: Readonly<Record<MessageStatusDto, string>> = {
  missing: 'paperl10n-status-missing',
  draft: 'paperl10n-message-status-draft',
  translated: 'paperl10n-status-translated',
  outdated: 'paperl10n-status-outdated',
};
const filters: readonly { readonly value: StatusFilter; readonly name: string }[] = [
  { value: 'all', name: 'paperl10n-filter-all' },
  { value: 'needs-work', name: 'paperl10n-filter-needs-work' },
  { value: 'missing', name: statusNames.missing },
  { value: 'outdated', name: statusNames.outdated },
  { value: 'draft', name: statusNames.draft },
  { value: 'translated', name: statusNames.translated },
];
</script>

<template>
  <article class="catalog" :aria-busy="loading">
    <div v-if="error !== null" class="catalog-error" role="alert">
      <p>{{ errorMessage(error, t) }}</p>
    </div>
    <template v-else-if="detail !== null">
      <header class="catalog-header">
        <h2 class="catalog-title">
          <bdi>{{ detail.key }}</bdi>
        </h2>
        <p class="catalog-paths">
          <bdi dir="ltr">{{ detail.sourcePath }}</bdi>
          <span aria-hidden="true"> → </span>
          <bdi dir="ltr">{{ detail.targetPath }}</bdi>
          <template v-if="!detail.targetExists">
            · {{ t('paperl10n-catalog-no-translation-file') }}
          </template>
        </p>
      </header>
      <p v-if="detail.documentationProblem !== null" class="catalog-warning" role="alert">
        {{ t('paperl10n-documentation-unreadable') }}
        {{ errorMessage(detail.documentationProblem, t) }}
      </p>

      <div class="catalog-tools">
        <label class="catalog-search">
          <span class="visually-hidden">{{ t('paperl10n-find-message') }}</span>
          <AppIcon name="search" :size="16" />
          <input
            v-model="query"
            type="search"
            :placeholder="t('paperl10n-find-message-placeholder')"
          />
        </label>
        <label class="catalog-filter">
          <span>{{ t('paperl10n-message-filter') }}</span>
          <select v-model="status">
            <option v-for="filter in filters" :key="filter.value" :value="filter.value">
              {{ t(filter.name) }}
            </option>
          </select>
        </label>
        <span class="catalog-count" role="status">
          {{ t('paperl10n-messages-showing', shown.length, messages.length) }}
        </span>
      </div>

      <div v-if="shown.length > 0" ref="scrollBox" class="catalog-scroll">
        <table class="catalog-messages" :aria-rowcount="shown.length + 1">
          <thead>
            <tr aria-rowindex="1">
              <th scope="col">{{ t('paperl10n-column-message') }}</th>
              <th scope="col">{{ t('paperl10n-source-pane', autonym(sourceLocale.id)) }}</th>
              <th scope="col">{{ t('paperl10n-target-pane', autonym(targetLocale.id)) }}</th>
              <th scope="col">
                <span class="visually-hidden">{{ t('paperl10n-column-status') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.before.value > 0" class="catalog-spacer" aria-hidden="true">
              <td colspan="4" :style="{ blockSize: `${rows.before.value}px` }"></td>
            </tr>
            <tr
              v-for="{ message, index } in rendered"
              :key="message.key"
              data-row
              :aria-rowindex="index + 2"
              :data-status="message.status"
            >
              <th scope="row" class="catalog-key">
                <bdi dir="ltr" class="catalog-clamp">{{ message.key }}</bdi>
              </th>
              <td :lang="sourceLocale.id" :dir="sourceLocale.direction">
                <span class="catalog-clamp">
                  <MessageText :text="message.source" :tokens="message.sourceTokens" />
                </span>
              </td>
              <td :lang="targetLocale.id" :dir="targetLocale.direction">
                <span v-if="message.translation !== null" class="catalog-clamp">
                  <MessageText :text="message.translation" :tokens="message.translationTokens" />
                </span>
              </td>
              <td class="catalog-status">
                <span class="pages-status" :data-status="message.status" aria-hidden="true"></span>
                <span class="visually-hidden">{{ t(statusNames[message.status]) }}</span>
              </td>
            </tr>
            <tr v-if="rows.after.value > 0" class="catalog-spacer" aria-hidden="true">
              <td colspan="4" :style="{ blockSize: `${rows.after.value}px` }"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="catalog-none">{{ t('paperl10n-no-matching-messages') }}</p>

      <section v-if="detail.notInSource.length > 0" class="catalog-orphans">
        <h3>{{ t('paperl10n-not-in-source', detail.notInSource.length) }}</h3>
        <p class="catalog-note">{{ t('paperl10n-not-in-source-note') }}</p>
        <ul>
          <li v-for="message in detail.notInSource" :key="message.key">
            <bdi dir="ltr" class="catalog-key">{{ message.key }}</bdi>
            <span :lang="targetLocale.id" :dir="targetLocale.direction">
              <MessageText :text="message.text" :tokens="message.tokens" />
            </span>
          </li>
        </ul>
      </section>
    </template>
  </article>
</template>

<style scoped>
.catalog {
  --catalog-row-height: 4.5rem;

  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--pl-space-4);
  min-block-size: 0;
}

/* The list scrolls on its own, so only the rows in view need rendering: within the window's
   height when the app takes it (wide windows), else a fixed share of it. */
.catalog-scroll {
  block-size: 70vh;
  overflow-y: auto;
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
}

@media (min-width: 64rem) {
  .catalog-scroll {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 12rem;
  }
}

.catalog-header {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
}

.catalog-title {
  margin: 0;
  font-size: var(--pl-text-lg);
}

.catalog-paths,
.catalog-count,
.catalog-note,
.catalog-none {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.catalog-error,
.catalog-warning {
  margin: 0;
  padding: var(--pl-space-3);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
  color: var(--pl-color-danger);
}

.catalog-error p {
  margin: 0;
}

.catalog-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-3);
}

.catalog-search {
  display: flex;
  flex: 1 1 16rem;
  align-items: center;
  gap: var(--pl-space-2);
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  color: var(--pl-color-muted);
}

.catalog-search:focus-within {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 1px;
}

.catalog-search input {
  flex: 1 1 auto;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  color: var(--pl-color-ink);
  outline: none;
}

.catalog-filter {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  font-size: var(--pl-text-sm);
}

.catalog-filter select {
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-2);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
}

.catalog-messages {
  inline-size: 100%;
  border-collapse: collapse;
  background: var(--pl-color-surface);
  font-family: var(--pl-font-text);
}

.catalog-messages th,
.catalog-messages td {
  padding-block: var(--pl-space-2);
  padding-inline: var(--pl-space-3);
  border-block-end: 1px solid var(--pl-color-line);
  text-align: start;
  vertical-align: top;
}

.catalog-messages thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--pl-color-surface);
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.catalog-messages tr[data-row] {
  block-size: var(--catalog-row-height);
}

.catalog-spacer td {
  padding: 0;
  border: 0;
}

/* Two lines at most, so every row is the same height; a row opened for editing shows it all. */
.catalog-clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.catalog-key {
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
  font-weight: 400;
  overflow-wrap: anywhere;
}

.catalog-status {
  inline-size: 1.5rem;
}

.catalog-orphans {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
}

.catalog-orphans h3 {
  margin: 0;
  font-size: var(--pl-text-md);
}

.catalog-orphans ul {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.catalog-orphans li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-3);
}
</style>
