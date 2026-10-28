<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { ProjectSummaryDto } from '#ipc-contract';
import { computed } from 'vue';
import { isUiLocale, uiLocales, useI18n } from '../i18n/i18n';
import { autonym } from '../i18n/language-name';
import AppIcon from './AppIcon.vue';
import AppMark from './AppMark.vue';
import ThemeSwitch from './ThemeSwitch.vue';

const props = defineProps<{ summary: ProjectSummaryDto | null; busy: boolean }>();
const emit = defineEmits<{ open: [] }>();

const { t, locale } = useI18n();
const languages = Object.keys(uiLocales);
const source = computed(() => props.summary?.sourceLocale ?? null);
const target = computed(() => props.summary?.targetLocale ?? null);

function onLanguageChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (isUiLocale(value)) locale.value = value;
}
</script>

<template>
  <header class="header">
    <div class="header-brand">
      <AppMark />
      <h1 class="header-title">{{ t('paperl10n-app-name') }}</h1>
    </div>

    <template v-if="summary !== null && source !== null && target !== null">
      <p class="header-project">
        <strong>{{ summary.name }}</strong>
        <span aria-hidden="true">·</span>
        <span :title="t('paperl10n-project-format', summary.documentFormat.displayName)">
          {{ summary.documentFormat.displayName }}
        </span>
      </p>
      <p class="header-languages">
        <span class="visually-hidden">
          {{ t('paperl10n-language-pair', autonym(source.id), autonym(target.id)) }}
        </span>
        <span aria-hidden="true" :lang="source.id" :dir="source.direction">{{
          autonym(source.id)
        }}</span>
        <AppIcon name="forward" :size="16" />
        <span aria-hidden="true" :lang="target.id" :dir="target.direction">{{
          autonym(target.id)
        }}</span>
      </p>
    </template>

    <span class="header-spacer"></span>

    <button
      v-if="summary !== null"
      type="button"
      class="pl-button header-open"
      :disabled="busy"
      @click="emit('open')"
    >
      <AppIcon name="folder" />
      {{ busy ? t('paperl10n-opening') : t('paperl10n-open-folder') }}
    </button>
    <label class="header-language">
      <span>{{ t('paperl10n-interface-language') }}</span>
      <select class="pl-button" :value="locale" @change="onLanguageChange">
        <option v-for="code in languages" :key="code" :value="code" :lang="code">
          {{ autonym(code) }}
        </option>
      </select>
    </label>
    <ThemeSwitch />
  </header>
</template>

<style scoped>
.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-3) var(--pl-space-4);
  padding-block: var(--pl-space-2);
  padding-inline: var(--pl-space-5);
  border-block-end: 1px solid var(--pl-color-line);
  background: var(--pl-color-bar);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
}

.header-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
  font-weight: 600;
}

.header-project {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  margin: 0;
  padding-block: var(--pl-space-1);
  padding-inline: var(--pl-space-3);
  border-radius: 999px;
  background: var(--pl-color-chip);
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.header-project strong {
  color: var(--pl-color-ink);
}

.header-languages {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  margin: 0;
  font-size: var(--pl-text-sm);
  font-weight: 500;
}

.header-spacer {
  flex: 1 1 0;
}

.header-open {
  display: inline-flex;
  align-items: center;
  gap: var(--pl-space-2);
}

.header-language {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}
</style>
