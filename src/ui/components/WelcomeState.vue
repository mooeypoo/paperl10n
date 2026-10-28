<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { useI18n } from '../i18n/i18n';
import AppIcon from './AppIcon.vue';

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="welcome" :aria-label="t('paperl10n-welcome-title')">
    <h2 class="welcome-title">{{ t('paperl10n-welcome-title') }}</h2>
    <p class="welcome-text">{{ t('paperl10n-empty-state') }}</p>
    <button
      type="button"
      class="pl-button welcome-open"
      data-variant="primary"
      :disabled="busy"
      @click="emit('open')"
    >
      <AppIcon name="folder" />
      {{ busy ? t('paperl10n-opening') : t('paperl10n-open-folder') }}
    </button>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--pl-space-4);
  max-inline-size: 32rem;
  margin-block: var(--pl-space-6);
  margin-inline: auto;
  padding: var(--pl-space-6);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  box-shadow: var(--pl-shadow-sheet);
  text-align: center;
}

.welcome-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-xl);
  font-weight: 600;
}

.welcome-text {
  margin: 0;
  color: var(--pl-color-muted);
}

.welcome-open {
  display: inline-flex;
  align-items: center;
  gap: var(--pl-space-2);
}
</style>
