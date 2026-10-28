<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { DocumentTextDto, LocaleDto } from '#ipc-contract';
import { useId } from 'vue';
import { useI18n } from '../i18n/i18n';
import MarkdownView from './MarkdownView.vue';

defineProps<{
  heading: string;
  locale: LocaleDto;
  path: string;
  /** `null` once loaded means the file doesn't exist yet. */
  document: DocumentTextDto | null;
  loading: boolean;
}>();
const { t, locale: uiLocale, direction: uiDirection } = useI18n();
const headingId = useId();
</script>

<template>
  <!-- Each pane carries its own language and direction (AGENTS.md, UI and design). Its heading and
       notes are interface text, so they follow the interface's language and direction instead. -->
  <section
    class="pane"
    :lang="locale.id"
    :dir="locale.direction"
    :aria-labelledby="headingId"
    :aria-busy="loading"
  >
    <header class="pane-header" :lang="uiLocale" :dir="uiDirection">
      <h3 :id="headingId" class="pane-heading">{{ heading }}</h3>
      <!-- A file path isn't prose in any language: isolate it (bdi). -->
      <p class="pane-path">
        <bdi>{{ path }}</bdi>
      </p>
    </header>
    <div class="pane-body">
      <p v-if="loading" class="pane-note" :lang="uiLocale" :dir="uiDirection">
        {{ t('paperl10n-reading') }}
      </p>
      <p v-else-if="document === null" class="pane-note" :lang="uiLocale" :dir="uiDirection">
        {{ t('paperl10n-translation-missing') }}
      </p>
      <MarkdownView v-else :document="document" />
    </div>
  </section>
</template>

<style scoped>
.pane {
  min-inline-size: 0;
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  box-shadow: var(--pl-shadow-sheet);
}

.pane-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--pl-space-1) var(--pl-space-3);
  padding-block: var(--pl-space-3);
  padding-inline: var(--pl-space-5);
  border-block-end: 1px solid var(--pl-color-line);
}

.pane-heading {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.pane-path {
  margin: 0;
  color: var(--pl-color-muted);
  font-family: var(--pl-font-mono);
  font-size: 0.75rem;
}

.pane-body {
  padding-block: var(--pl-space-4) var(--pl-space-5);
  padding-inline: var(--pl-space-5);
}

.pane-note {
  margin: 0;
  color: var(--pl-color-muted);
}
</style>
