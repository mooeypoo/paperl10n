<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto, PlaceholderTokenDto } from '#ipc-contract';
import { computed } from 'vue';
import { messagePreview, type PreviewRow } from '../catalog/message-preview';
import { isolated, useI18n } from '../i18n/i18n';

// The open message's translation as it would read for each plural form of the target language
// and each gender (catalog/message-preview.ts). Nothing shows for a translation with neither.
// It follows main's answer (the text its tokens are for), so it lags typing by the check's pause.
const props = defineProps<{
  text: string;
  tokens: readonly PlaceholderTokenDto[];
  /** The translation's language and direction (the target's). */
  locale: LocaleDto;
}>();
const { t } = useI18n();

const preview = computed(() => messagePreview(props.locale.id, props.text, props.tokens));

/** What a row is for: "For 2 (two)", or a gender. */
function label(row: PreviewRow): string {
  return row.kind === 'plural'
    ? t('paperl10n-message-preview-count', isolated(String(row.count)), isolated(row.category))
    : t(`paperl10n-message-preview-${row.gender}`);
}
</script>

<template>
  <section v-if="preview !== null" class="message-preview">
    <h3>{{ t('paperl10n-message-preview') }}</h3>
    <dl v-if="preview.kind === 'rows'">
      <div v-for="(row, at) in preview.rows" :key="at" :data-preview="row.kind">
        <dt>{{ label(row) }}</dt>
        <dd :lang="locale.id" :dir="locale.direction">{{ row.text }}</dd>
      </div>
    </dl>
    <p v-else class="message-preview-note">{{ t('paperl10n-message-preview-unreadable') }}</p>
  </section>
</template>

<style scoped>
.message-preview {
  padding-inline-start: var(--pl-space-3);
  border-inline-start: 3px solid var(--pl-color-accent);
}

.message-preview h3 {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.message-preview dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--pl-space-1) var(--pl-space-3);
  margin: var(--pl-space-1) 0 0;
}

.message-preview dl > div {
  display: contents;
}

.message-preview dt {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.message-preview dd {
  margin: 0;
  font-family: var(--pl-font-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message-preview-note {
  margin: var(--pl-space-1) 0 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}
</style>
