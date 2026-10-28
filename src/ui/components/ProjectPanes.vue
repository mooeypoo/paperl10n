<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { ProjectSummaryDto, SourceDocumentDto } from '#ipc-contract';
import { computed } from 'vue';
import { useI18n } from '../i18n/i18n';
import DocumentPane from './DocumentPane.vue';

const props = defineProps<{
  summary: ProjectSummaryDto;
  documents: readonly SourceDocumentDto[];
}>();

const { t } = useI18n();
const sourcePaths = computed(() => props.documents.map((document) => document.sourcePath));
const targetPaths = computed(() => props.documents.map((document) => document.targetPath));
</script>

<template>
  <div class="project">
    <p class="project-meta">
      <strong>{{ summary.name }}</strong>
      · {{ t('paperl10n-project-format', summary.documentFormat.displayName) }} ·
      {{ t('paperl10n-documents-count', documents.length) }}
    </p>
    <div v-if="summary.warnings.length > 0" class="project-warnings">
      <p>{{ t('paperl10n-config-warnings') }}</p>
      <ul>
        <li v-for="warning in summary.warnings" :key="warning" lang="en" dir="ltr">
          {{ warning }}
        </li>
      </ul>
    </div>
    <p v-if="documents.length === 0">{{ t('paperl10n-no-documents') }}</p>
    <div v-else class="project-panes">
      <DocumentPane
        :heading="t('paperl10n-source-pane', summary.sourceLocale.id)"
        :locale="summary.sourceLocale"
        :paths="sourcePaths"
      />
      <DocumentPane
        :heading="t('paperl10n-target-pane', summary.targetLocale.id)"
        :locale="summary.targetLocale"
        :paths="targetPaths"
      />
    </div>
  </div>
</template>

<style scoped>
.project {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
}

.project-meta {
  margin: 0;
  color: var(--pl-color-muted);
}

.project-meta strong {
  color: var(--pl-color-ink);
}

.project-warnings {
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-chip);
}

.project-warnings p,
.project-warnings ul {
  margin: 0;
}

.project-panes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-5);
  align-items: flex-start;
}
</style>
