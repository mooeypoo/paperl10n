<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { ProjectSummaryDto, SourceDocumentDto } from '#ipc-contract';
import { useI18n } from '../i18n/i18n';
import { autonym } from '../i18n/language-name';
import DocumentPane from './DocumentPane.vue';

defineProps<{ summary: ProjectSummaryDto; document: SourceDocumentDto }>();
const { t } = useI18n();
</script>

<template>
  <article class="document">
    <header class="document-header">
      <h2 class="document-title">
        <bdi>{{ document.key }}</bdi>
      </h2>
      <p class="document-paths" dir="ltr">{{ document.sourcePath }} → {{ document.targetPath }}</p>
    </header>
    <div class="document-panes">
      <DocumentPane
        :heading="t('paperl10n-source-pane', autonym(summary.sourceLocale.id))"
        :locale="summary.sourceLocale"
        :path="document.sourcePath"
      />
      <DocumentPane
        :heading="t('paperl10n-target-pane', autonym(summary.targetLocale.id))"
        :locale="summary.targetLocale"
        :path="document.targetPath"
      />
    </div>
    <p class="document-later">{{ t('paperl10n-content-later') }}</p>
  </article>
</template>

<style scoped>
.document {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
}

.document-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--pl-space-2) var(--pl-space-4);
}

.document-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-xl);
  font-weight: 600;
}

.document-paths {
  margin: 0;
  color: var(--pl-color-muted);
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
}

.document-panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: var(--pl-space-5);
}

.document-later {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}
</style>
