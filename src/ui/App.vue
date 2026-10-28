<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue';
import { useClient } from './client';
import ProjectPanes from './components/ProjectPanes.vue';
import { useProject } from './composables/use-project';
import { errorMessage } from './i18n/error-message';
import { isUiLocale, uiLocales, useI18n } from './i18n/i18n';

const { t, locale } = useI18n();
const project = useProject(useClient());
const { summary, documents, error, busy } = project;
const errorText = computed(() => (error.value === null ? '' : errorMessage(error.value, t)));
const languages = Object.keys(uiLocales);

function onLanguageChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (isUiLocale(value)) locale.value = value;
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="app-title">{{ t('paperl10n-app-name') }}</h1>
      <button
        type="button"
        class="pl-button"
        data-variant="primary"
        :disabled="busy"
        @click="project.open()"
      >
        {{ busy ? t('paperl10n-opening') : t('paperl10n-open-folder') }}
      </button>
      <span class="app-spacer"></span>
      <label class="app-language">
        <span>{{ t('paperl10n-interface-language') }}</span>
        <select class="pl-button" :value="locale" @change="onLanguageChange">
          <option v-for="code in languages" :key="code" :value="code" :lang="code">
            {{ code }}
          </option>
        </select>
      </label>
    </header>

    <main class="app-main">
      <div v-if="error !== null" class="app-error" role="alert">
        <p>{{ errorText }}</p>
        <ul v-if="error.details.length > 0">
          <li v-for="detail in error.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
        </ul>
      </div>
      <ProjectPanes v-if="summary !== null" :summary="summary" :documents="documents" />
      <p v-else-if="error === null" class="app-empty">{{ t('paperl10n-empty-state') }}</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-4);
  padding-block: var(--pl-space-3);
  padding-inline: var(--pl-space-5);
  border-block-end: 1px solid var(--pl-color-line);
  background: var(--pl-color-bar);
}

.app-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
}

.app-spacer {
  flex: 1 1 0;
}

.app-language {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.app-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
  padding: var(--pl-space-5);
}

.app-error {
  padding: var(--pl-space-3) var(--pl-space-4);
  border: 1px solid var(--pl-color-danger);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
}

.app-error p,
.app-error ul {
  margin: 0;
}

.app-empty {
  margin: 0;
  color: var(--pl-color-muted);
}
</style>
