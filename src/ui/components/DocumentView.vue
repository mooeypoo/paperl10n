<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { DocumentPairDto, ErrorDto, LocaleDto, SourceDocumentDto } from '#ipc-contract';
import { computed } from 'vue';
import { errorMessage } from '../i18n/error-message';
import { useI18n } from '../i18n/i18n';
import { autonym } from '../i18n/language-name';
import DocumentPane from './DocumentPane.vue';

const props = defineProps<{
  sourceLocale: LocaleDto;
  targetLocale: LocaleDto;
  document: SourceDocumentDto;
  pair: DocumentPairDto | null;
  loading: boolean;
  error: ErrorDto | null;
}>();
const { t } = useI18n();
// Only the pair for this page counts: while the next page loads, the previous one isn't shown.
const current = computed(() => (props.pair?.key === props.document.key ? props.pair : null));
const waiting = computed(() => props.loading || (current.value === null && props.error === null));
</script>

<template>
  <article class="document">
    <header class="document-header">
      <h2 class="document-title">
        <bdi>{{ document.key }}</bdi>
      </h2>
    </header>
    <div v-if="error !== null" class="document-error" role="alert">
      {{ errorMessage(error, t) }}
    </div>
    <div v-else class="document-panes">
      <DocumentPane
        :heading="t('paperl10n-source-pane', autonym(sourceLocale.id))"
        :locale="sourceLocale"
        :path="document.sourcePath"
        :document="current?.source ?? null"
        :loading="waiting"
        read-only
      />
      <DocumentPane
        :heading="t('paperl10n-target-pane', autonym(targetLocale.id))"
        :locale="targetLocale"
        :path="document.targetPath"
        :document="current?.target ?? null"
        :loading="waiting"
        :read-only="false"
      />
    </div>
  </article>
</template>

<style scoped>
.document {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
}

.document-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-xl);
  font-weight: 600;
}

.document-panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: var(--pl-space-5);
  align-items: start;
}

.document-error {
  padding: var(--pl-space-3) var(--pl-space-4);
  border: 1px solid var(--pl-color-danger);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
}
</style>
