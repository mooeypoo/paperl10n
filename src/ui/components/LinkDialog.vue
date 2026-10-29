<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Edits a link (or makes one) as two fields instead of Markdown: its text, in the pane's language
  and direction, and its destination, always left to right. Enter applies; Escape (the dialog's own
  cancel) changes nothing. The answer goes back through the editor's request, which returns focus
  to the text.
-->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';
import type { LinkEdit } from '../editor/link-editing';
import { useI18n } from '../i18n/i18n';

const props = defineProps<{
  /** The request being answered, or `null` when closed. */
  edit: LinkEdit | null;
  /** The text's language and direction (the pane's). */
  locale: LocaleDto;
}>();
const emit = defineEmits<{ close: [] }>();
const { t, locale: uiLocale, direction: uiDirection } = useI18n();
const titleId = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const textInput = useTemplateRef<HTMLInputElement>('text-input');
const urlInput = useTemplateRef<HTMLInputElement>('url-input');
const text = ref('');
const url = ref('');
const canApply = computed(() => url.value.trim() !== '');

watch(
  () => props.edit,
  async (edit) => {
    const element = dialog.value;
    if (element === null) return;
    if (edit !== null) {
      text.value = edit.text;
      url.value = edit.url;
      if (!element.open) element.showModal();
      await nextTick();
      // The destination is what's usually changed; a new link without text starts with its text.
      (edit.text === '' ? textInput : urlInput).value?.focus();
    } else if (element.open) {
      element.close();
    }
  },
  { flush: 'post' },
);

function answer(act: (edit: LinkEdit) => void): void {
  const { edit } = props;
  emit('close');
  if (edit !== null) act(edit);
}

function onSubmit(): void {
  if (canApply.value) {
    answer((edit) => {
      edit.apply(text.value, url.value);
    });
  }
}

function onCancel(event: Event): void {
  // Escape: change nothing. The parent closes the dialog by clearing `edit`.
  event.preventDefault();
  answer((edit) => {
    edit.cancel();
  });
}
</script>

<template>
  <!-- The dialog is interface text (it sits in a pane, but doesn't take the pane's direction);
       only the link text field is in the page's language. -->
  <dialog
    ref="dialog"
    class="link-dialog"
    :lang="uiLocale"
    :dir="uiDirection"
    :aria-labelledby="titleId"
    @cancel="onCancel"
  >
    <form class="link-form" @submit.prevent="onSubmit">
      <h2 :id="titleId" class="link-title">
        {{ t(edit?.existing === false ? 'paperl10n-link-add' : 'paperl10n-link-edit') }}
      </h2>
      <label class="link-field">
        <span>{{ t('paperl10n-link-text') }}</span>
        <input
          ref="text-input"
          v-model="text"
          type="text"
          :lang="locale.id"
          :dir="locale.direction"
          autocomplete="off"
        />
      </label>
      <label class="link-field">
        <span>{{ t('paperl10n-link-url') }}</span>
        <input
          ref="url-input"
          v-model="url"
          class="link-url"
          type="text"
          dir="ltr"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <div class="link-actions">
        <button
          v-if="edit?.existing"
          type="button"
          class="pl-button link-remove"
          @click="
            answer((request) => {
              request.remove();
            })
          "
        >
          {{ t('paperl10n-link-remove') }}
        </button>
        <button
          type="button"
          class="pl-button"
          @click="
            answer((request) => {
              request.cancel();
            })
          "
        >
          {{ t('paperl10n-cancel') }}
        </button>
        <button type="submit" class="pl-button" data-variant="primary" :disabled="!canApply">
          {{ t(edit?.existing === false ? 'paperl10n-link-add-apply' : 'paperl10n-link-apply') }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.link-dialog {
  inline-size: min(32rem, 100vw - 2 * var(--pl-space-4));
  padding: var(--pl-space-5);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-sheet);
}

.link-dialog::backdrop {
  background: var(--pl-color-backdrop);
}

.link-form {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
}

.link-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
  font-weight: 600;
}

.link-field {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.link-field input {
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-bg);
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-md);
  font-weight: 400;
}

.link-field .link-url {
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
}

.link-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--pl-space-2);
}

/* Removing the link sits apart from the form's answer, at the start. */
.link-remove {
  margin-inline-end: auto;
}
</style>
