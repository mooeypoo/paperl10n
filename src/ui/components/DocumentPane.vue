<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';
import { useId } from 'vue';
import { useI18n } from '../i18n/i18n';

defineProps<{
  heading: string;
  locale: LocaleDto;
  path: string;
}>();
const { locale: uiLocale, direction: uiDirection } = useI18n();
const headingId = useId();
</script>

<template>
  <!-- Each pane carries its own language and direction (AGENTS.md, UI and design). Its heading is
       interface text, so it follows the interface's language and direction instead. -->
  <section class="pane" :lang="locale.id" :dir="locale.direction" :aria-labelledby="headingId">
    <h3 :id="headingId" class="pane-heading" :lang="uiLocale" :dir="uiDirection">{{ heading }}</h3>
    <!-- A file path isn't prose in the pane's language: isolate it (bdi). -->
    <p class="pane-path">
      <bdi>{{ path }}</bdi>
    </p>
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

.pane-heading {
  margin: 0;
  padding-block: var(--pl-space-3);
  padding-inline: var(--pl-space-5);
  border-block-end: 1px solid var(--pl-color-line);
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.pane-path {
  margin: 0;
  padding-block: var(--pl-space-4);
  padding-inline: var(--pl-space-5);
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
}
</style>
