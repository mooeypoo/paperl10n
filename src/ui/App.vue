<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue';
import { useClient } from './client';
import AppHeader from './components/AppHeader.vue';
import DocumentView from './components/DocumentView.vue';
import PagesSidebar from './components/PagesSidebar.vue';
import WelcomeState from './components/WelcomeState.vue';
import { useDocumentPair } from './composables/use-document-pair';
import { usePages } from './composables/use-pages';
import { useProject } from './composables/use-project';
import { errorMessage } from './i18n/error-message';
import { useI18n } from './i18n/i18n';

const { t } = useI18n();
const client = useClient();
const project = useProject(client);
const { summary, documents, error, busy } = project;
const { query, matches, selectedKey, selected } = usePages(documents);
const projectId = computed(() => summary.value?.projectId ?? null);
const reading = useDocumentPair(client, projectId, selectedKey);
const { pair, loading } = reading;
const readError = reading.error;
const errorText = computed(() => (error.value === null ? '' : errorMessage(error.value, t)));

function open(): void {
  void project.open();
}
</script>

<template>
  <div class="app">
    <AppHeader :summary="summary" :busy="busy" @open="open" />

    <div v-if="summary !== null" class="app-body">
      <PagesSidebar
        v-model:query="query"
        class="app-sidebar"
        :documents="documents"
        :matches="matches"
        :selected-key="selectedKey"
        @select="(key) => (selectedKey = key)"
      />
      <main class="app-main">
        <div v-if="error !== null" class="app-error" role="alert">
          <p>{{ errorText }}</p>
          <ul v-if="error.details.length > 0">
            <li v-for="detail in error.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
          </ul>
        </div>
        <div v-if="summary.warnings.length > 0" class="app-warnings">
          <p>{{ t('paperl10n-config-warnings') }}</p>
          <ul>
            <li v-for="warning in summary.warnings" :key="warning" lang="en" dir="ltr">
              {{ warning }}
            </li>
          </ul>
        </div>
        <p v-if="summary.targetLocale === null" class="app-notice">
          {{ t('paperl10n-needs-target') }}
        </p>
        <DocumentView
          v-else-if="selected !== null"
          :source-locale="summary.sourceLocale"
          :target-locale="summary.targetLocale"
          :document="selected"
          :pair="pair"
          :loading="loading"
          :error="readError"
        />
        <p v-else class="app-empty">{{ t('paperl10n-no-documents') }}</p>
      </main>
    </div>

    <main v-else class="app-main">
      <div v-if="error !== null" class="app-error" role="alert">
        <p>{{ errorText }}</p>
        <ul v-if="error.details.length > 0">
          <li v-for="detail in error.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
        </ul>
      </div>
      <WelcomeState :busy="busy" @open="open" />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
}

.app-body {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  min-block-size: 0;
}

.app-sidebar {
  flex: 1 1 15rem;
  max-inline-size: 18rem;
}

.app-main {
  flex: 999 1 36rem;
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
  padding: var(--pl-space-5);
}

.app-error,
.app-warnings {
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
}

.app-error {
  border: 1px solid var(--pl-color-danger);
  background: var(--pl-color-danger-surface);
}

.app-warnings {
  background: var(--pl-color-chip);
}

.app-notice {
  margin: 0;
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-chip);
}

.app-error p,
.app-error ul,
.app-warnings p,
.app-warnings ul {
  margin: 0;
}

.app-empty {
  margin: 0;
  color: var(--pl-color-muted);
}
</style>
