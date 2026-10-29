<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Asked before leaving a page whose translation has unsaved changes: save, don't save, or stay.
  Escape (the dialog's own cancel) means stay.
-->
<script setup lang="ts">
import { nextTick, useId, useTemplateRef, watch } from 'vue';
import { isolated, useI18n } from '../i18n/i18n';

const props = defineProps<{
  open: boolean;
  /** The page with unsaved changes. */
  pageKey: string;
  busy: boolean;
}>();
const emit = defineEmits<{ save: []; discard: []; cancel: [] }>();
const { t } = useI18n();
const titleId = useId();
const messageId = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const saveButton = useTemplateRef<HTMLButtonElement>('save');

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value;
    if (element === null) return;
    if (open) {
      if (!element.open) element.showModal();
      await nextTick();
      saveButton.value?.focus();
    } else if (element.open) {
      element.close();
    }
  },
  { flush: 'post' },
);

function onCancel(event: Event): void {
  // Escape: stay. The parent closes the dialog by changing `open`.
  event.preventDefault();
  emit('cancel');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="unsaved"
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
    @cancel="onCancel"
  >
    <h2 :id="titleId" class="unsaved-title">{{ t('paperl10n-unsaved-title') }}</h2>
    <p :id="messageId" class="unsaved-message">
      {{ t('paperl10n-unsaved-message', isolated(pageKey)) }}
    </p>
    <div class="unsaved-actions">
      <button type="button" class="pl-button" :disabled="busy" @click="emit('cancel')">
        {{ t('paperl10n-cancel') }}
      </button>
      <button type="button" class="pl-button" :disabled="busy" @click="emit('discard')">
        {{ t('paperl10n-discard-changes') }}
      </button>
      <button
        ref="save"
        type="button"
        class="pl-button"
        data-variant="primary"
        :disabled="busy"
        @click="emit('save')"
      >
        {{ t('paperl10n-save') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.unsaved {
  inline-size: min(28rem, 100vw - 2 * var(--pl-space-4));
  padding: var(--pl-space-5);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-sheet);
}

.unsaved[open] {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
}

.unsaved::backdrop {
  background: var(--pl-color-backdrop);
}

.unsaved-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
  font-weight: 600;
}

.unsaved-message {
  margin: 0;
}

.unsaved-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--pl-space-2);
}
</style>
