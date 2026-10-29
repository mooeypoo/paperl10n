<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  The target-language picker: a modal dialog with a search box over a list of languages
  (the ARIA combobox pattern). Before typing it shows the project's languages, recent picks,
  and suggestions; typing searches every language. Each language is shown by its own name,
  marked with its lang and dir, then by its name in the interface language and its code.
-->
<script setup lang="ts">
import type { ErrorDto, LanguageDto, LocaleDto } from '#ipc-contract';
import { computed, nextTick, ref, toRef, useTemplateRef, watch } from 'vue';
import { useClient } from '../client';
import { useLanguagePicker, type PickerSection } from '../composables/use-language-picker';
import { useEnvironment } from '../environment';
import { errorMessage } from '../i18n/error-message';
import { useI18n } from '../i18n/i18n';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  open: boolean;
  projectId: string | null;
  current: LocaleDto | null;
  /** A choice is being saved. */
  busy: boolean;
  /** Why the last choice failed. */
  chooseError: ErrorDto | null;
}>();
const emit = defineEmits<{ close: []; choose: [tag: string] }>();

const { t, locale } = useI18n();
const picker = useLanguagePicker(useClient(), toRef(props, 'projectId'), locale, useEnvironment());
const { query, sections, options, loading } = picker;
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const input = useTemplateRef<HTMLInputElement>('input');
const activeTag = ref<string | null>(null);

const shownError = computed(() => props.chooseError ?? picker.error.value);
const optionId = (language: LanguageDto) => `language-option-${language.tag}`;
const active = computed(() => options.value.find((l) => l.tag === activeTag.value) ?? null);
const isCurrent = (language: LanguageDto) =>
  props.current !== null && language.tag.toLowerCase() === props.current.id.toLowerCase();
/** The autonym is the main label when known; otherwise the name in the interface language. */
const ownName = (language: LanguageDto) => language.autonym ?? language.name;
const showsName = (language: LanguageDto) =>
  language.autonym !== null && language.autonym !== language.name;

const headings: Record<Exclude<PickerSection['id'], 'results'>, string> = {
  inProject: 'paperl10n-languages-in-project',
  recent: 'paperl10n-languages-recent',
  suggested: 'paperl10n-languages-suggested',
};

const status = computed(() =>
  loading.value
    ? ''
    : query.value.trim() === ''
      ? t('paperl10n-languages-count', options.value.length)
      : options.value.length === 0
        ? t('paperl10n-no-matching-languages', query.value.trim())
        : t('paperl10n-languages-count', options.value.length),
);

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value;
    if (element === null) return;
    if (open) {
      query.value = '';
      if (!element.open) element.showModal();
      await picker.refresh();
      await nextTick();
      input.value?.focus();
    } else if (element.open) {
      element.close();
    }
  },
  { flush: 'post' },
);
watch([query, locale], () => {
  if (props.open) void picker.refresh();
});
// Keep the active option on screen, and valid when the list changes.
watch(options, (languages) => {
  if (!languages.some((language) => language.tag === activeTag.value)) {
    activeTag.value = languages[0]?.tag ?? null;
  }
});
watch(active, async (language) => {
  await nextTick();
  if (language !== null)
    document.getElementById(optionId(language))?.scrollIntoView?.({ block: 'nearest' });
});

function move(step: number): void {
  const languages = options.value;
  if (languages.length === 0) return;
  const index = languages.findIndex((language) => language.tag === activeTag.value);
  const next = (index + step + languages.length) % languages.length;
  activeTag.value = languages[next]?.tag ?? null;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Enter' && active.value !== null) choose(active.value.tag);
  else return;
  event.preventDefault();
}

function choose(tag: string): void {
  if (!props.busy) emit('choose', tag);
}
</script>

<template>
  <dialog ref="dialog" class="picker" aria-labelledby="picker-title" @close="emit('close')">
    <h2 id="picker-title" class="picker-title">{{ t('paperl10n-choose-target') }}</h2>
    <label class="picker-search">
      <span class="visually-hidden">{{ t('paperl10n-language-search') }}</span>
      <AppIcon name="search" :size="16" />
      <input
        ref="input"
        v-model="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="picker-list"
        :aria-activedescendant="active === null ? undefined : optionId(active)"
        :placeholder="t('paperl10n-language-search-placeholder')"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKeydown"
      />
    </label>
    <p class="visually-hidden" role="status">{{ status }}</p>
    <div v-if="shownError !== null" class="picker-error" role="alert">
      <p>{{ errorMessage(shownError, t) }}</p>
      <ul v-if="shownError.details.length > 0">
        <li v-for="detail in shownError.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
      </ul>
    </div>
    <div
      id="picker-list"
      class="picker-list"
      role="listbox"
      :aria-label="t('paperl10n-languages')"
      :aria-busy="loading || busy"
    >
      <div
        v-for="section in sections"
        :key="section.id"
        class="picker-group"
        role="group"
        :aria-labelledby="section.id === 'results' ? undefined : `picker-heading-${section.id}`"
        :aria-label="section.id === 'results' ? t('paperl10n-languages') : undefined"
      >
        <div
          v-if="section.id !== 'results'"
          :id="`picker-heading-${section.id}`"
          class="picker-heading"
          role="presentation"
        >
          {{ t(headings[section.id]) }}
        </div>
        <div
          v-for="language in section.languages"
          :id="optionId(language)"
          :key="language.tag"
          class="picker-option"
          role="option"
          :aria-selected="language.tag === activeTag"
          @click="choose(language.tag)"
          @mousemove="activeTag = language.tag"
        >
          <span
            class="picker-own-name"
            :lang="language.autonym === null ? undefined : language.tag"
            :dir="language.autonym === null ? undefined : language.direction"
            >{{ ownName(language) }}</span
          >
          <span v-if="showsName(language)" class="picker-name">{{ language.name }}</span>
          <!-- The code reads left to right, but its place follows the row's direction. -->
          <span class="picker-tag"
            ><span dir="ltr">{{ language.tag }}</span></span
          >
          <span v-if="isCurrent(language)" class="picker-current">
            <AppIcon name="check" :size="16" />
            <span class="visually-hidden">{{ t('paperl10n-language-current') }}</span>
          </span>
        </div>
      </div>
      <p v-if="!loading && options.length === 0 && query.trim() !== ''" class="picker-none">
        {{ t('paperl10n-no-matching-languages', query.trim()) }}
      </p>
    </div>
    <div class="picker-actions">
      <button type="button" class="pl-button" @click="emit('close')">
        {{ t('paperl10n-cancel') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.picker {
  inline-size: min(34rem, 100vw - 2 * var(--pl-space-4));
  max-block-size: min(40rem, 100vh - 2 * var(--pl-space-6));
  padding: var(--pl-space-5);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-sheet);
}

.picker[open] {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
}

.picker::backdrop {
  background: var(--pl-color-backdrop);
}

.picker-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
  font-weight: 600;
}

.picker-search {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-bg);
  color: var(--pl-color-muted);
}

.picker-search:focus-within {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 1px;
}

.picker-search input {
  flex: 1 1 auto;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  color: var(--pl-color-ink);
  outline: none;
}

.picker-error {
  padding: var(--pl-space-3) var(--pl-space-4);
  border: 1px solid var(--pl-color-danger);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
}

.picker-error p,
.picker-error ul {
  margin: 0;
}

.picker-list {
  flex: 1 1 auto;
  min-block-size: 8rem;
  overflow-y: auto;
}

.picker-group + .picker-group {
  margin-block-start: var(--pl-space-3);
}

.picker-heading {
  padding-block: var(--pl-space-1);
  padding-inline: var(--pl-space-3);
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.picker-option {
  display: flex;
  align-items: baseline;
  gap: var(--pl-space-2);
  padding-block: var(--pl-space-2);
  padding-inline: var(--pl-space-3);
  border-inline-start: 3px solid transparent;
  border-radius: var(--pl-radius-md);
  cursor: pointer;
}

.picker-option[aria-selected='true'] {
  border-inline-start-color: var(--pl-color-accent);
  background: var(--pl-color-chip);
}

.picker-own-name {
  font-weight: 500;
}

.picker-name,
.picker-tag,
.picker-none {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.picker-tag {
  margin-inline-start: auto;
  font-family: var(--pl-font-mono);
}

.picker-current {
  align-self: center;
  color: var(--pl-color-accent-text);
}

.picker-none {
  margin: 0;
  padding: var(--pl-space-3);
}

.picker-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
