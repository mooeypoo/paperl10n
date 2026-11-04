<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  A quiet "Update available" in the header when a newer Paper Lion is out (ADR 0018). It opens a
  small panel: the version, "What's new", "Download", and "Not now", which stops mentioning that
  version. The links open in the browser (main's allow-list).
-->
<script setup lang="ts">
import type { UpdateNoticeDto } from '#ipc-contract';
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { useI18n } from '../i18n/i18n';

const props = defineProps<{ update: UpdateNoticeDto }>();
const emit = defineEmits<{ dismiss: [version: string] }>();
const { t, locale } = useI18n();
const panelId = useId();
const expanded = ref(false);
const toggle = useTemplateRef<HTMLButtonElement>('toggle');

/** The download page in the interface language, or English. */
const download = computed(() => props.update.download[locale.value] ?? props.update.download.en);

async function close(): Promise<void> {
  expanded.value = false;
  await nextTick();
  toggle.value?.focus();
}

function onFocusOut(event: FocusEvent): void {
  // Leaving the notice (not moving within it) closes the panel.
  const next = event.relatedTarget;
  if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return;
  expanded.value = false;
}
</script>

<template>
  <div class="update" @keydown.escape="close" @focusout="onFocusOut">
    <button
      ref="toggle"
      type="button"
      class="pl-button update-toggle"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      @click="expanded = !expanded"
    >
      <span class="update-dot" aria-hidden="true"></span>
      {{ t('paperl10n-update-available') }}
    </button>
    <div v-show="expanded" :id="panelId" class="update-panel" data-testid="update-panel">
      <p>{{ t('paperl10n-update-is-out', update.version) }}</p>
      <p class="update-links">
        <a :href="update.notes" target="_blank" rel="noreferrer">{{
          t('paperl10n-update-whats-new')
        }}</a>
        <a :href="download" target="_blank" rel="noreferrer">{{
          t('paperl10n-update-download')
        }}</a>
      </p>
      <button type="button" class="pl-button" @click="emit('dismiss', update.version)">
        {{ t('paperl10n-update-not-now') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.update {
  position: relative;
}

.update-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--pl-space-2);
  font-size: var(--pl-text-sm);
}

.update-dot {
  inline-size: 0.5rem;
  block-size: 0.5rem;
  border-radius: 50%;
  background: var(--pl-color-accent);
}

.update-panel {
  position: absolute;
  z-index: 10;
  inset-block-start: calc(100% + var(--pl-space-2));
  inset-inline-end: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--pl-space-3);
  inline-size: max-content;
  max-inline-size: 20rem;
  padding: var(--pl-space-4);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  box-shadow: var(--pl-shadow-sheet);
}

.update-panel p {
  margin: 0;
}

.update-links {
  display: flex;
  gap: var(--pl-space-4);
}

.update-links a {
  color: var(--pl-color-link);
}
</style>
