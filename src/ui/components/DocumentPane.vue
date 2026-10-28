<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';

defineProps<{
  heading: string;
  locale: LocaleDto;
  paths: readonly string[];
}>();
</script>

<template>
  <!-- Each pane carries its own language and direction (AGENTS.md, UI and design). -->
  <section class="pane" :lang="locale.id" :dir="locale.direction" :aria-label="heading">
    <h2 class="pane-heading">{{ heading }}</h2>
    <ul class="pane-list">
      <!-- A file path isn't prose in the pane's language: isolate it (bdi). -->
      <li v-for="path in paths" :key="path" class="pane-item">
        <bdi>{{ path }}</bdi>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pane {
  flex: 1 1 22rem;
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

.pane-list {
  margin: 0;
  padding-block: var(--pl-space-4);
  padding-inline: var(--pl-space-5);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
}
</style>
