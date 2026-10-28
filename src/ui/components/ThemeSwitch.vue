<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import { themeChoices, useTheme, type ThemeChoice } from '../composables/use-theme';
import { useI18n } from '../i18n/i18n';
import AppIcon from './AppIcon.vue';
import type { IconName } from './icons';

const { t } = useI18n();
const { choice } = useTheme();
const iconFor: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };
</script>

<template>
  <!-- Radio buttons: arrow keys move between them, and the choice is announced. -->
  <fieldset class="theme-switch">
    <legend class="visually-hidden">{{ t('paperl10n-theme') }}</legend>
    <label
      v-for="option in themeChoices"
      :key="option"
      class="theme-option"
      :title="t(`paperl10n-theme-${option}`)"
    >
      <input
        v-model="choice"
        class="visually-hidden"
        type="radio"
        name="paperl10n-theme"
        :value="option"
      />
      <AppIcon :name="iconFor[option]" />
      <span class="visually-hidden">{{ t(`paperl10n-theme-${option}`) }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.theme-switch {
  display: flex;
  margin: 0;
  padding: 3px;
  border: 0;
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-chip);
}

.theme-option {
  display: grid;
  place-items: center;
  inline-size: 2.125rem;
  block-size: 2.125rem;
  border-radius: var(--pl-radius-sm);
  color: var(--pl-color-muted);
  cursor: pointer;
}

.theme-option:has(input:checked) {
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-control);
}

.theme-option:has(input:focus-visible) {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 1px;
}
</style>
