<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Asked when saving finds the translation changed on disk since editing started (git, another
  editor): keep editing, reload the file (dropping the edits), or overwrite it with the edits.
  Keep editing is the default, and Escape (the dialog's own cancel) means it too.
-->
<script setup lang="ts">
import { nextTick, useId, useTemplateRef, watch } from 'vue';
import { isolated, useI18n } from '../i18n/i18n';

const props = defineProps<{
  open: boolean;
  /** The translation's file, as a project path. */
  path: string;
  busy: boolean;
}>();
const emit = defineEmits<{ reload: []; overwrite: []; keepEditing: [] }>();
const { t } = useI18n();
const titleId = useId();
const messageId = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const keepButton = useTemplateRef<HTMLButtonElement>('keep');

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value;
    if (element === null) return;
    if (open) {
      if (!element.open) element.showModal();
      await nextTick();
      keepButton.value?.focus();
    } else if (element.open) {
      element.close();
    }
  },
  { flush: 'post' },
);

function onCancel(event: Event): void {
  // Escape: keep editing. The parent closes the dialog by changing `open`.
  event.preventDefault();
  emit('keepEditing');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="conflict"
    role="alertdialog"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
    @cancel="onCancel"
  >
    <h2 :id="titleId" class="conflict-title">{{ t('paperl10n-conflict-title') }}</h2>
    <p :id="messageId" class="conflict-message">
      {{ t('paperl10n-conflict-message', isolated(path)) }}
    </p>
    <div class="conflict-actions">
      <button
        ref="keep"
        type="button"
        class="pl-button"
        :disabled="busy"
        @click="emit('keepEditing')"
      >
        {{ t('paperl10n-conflict-keep-editing') }}
      </button>
      <button type="button" class="pl-button" :disabled="busy" @click="emit('reload')">
        {{ t('paperl10n-conflict-reload') }}
      </button>
      <button
        type="button"
        class="pl-button"
        data-variant="danger"
        :disabled="busy"
        @click="emit('overwrite')"
      >
        {{ t('paperl10n-conflict-overwrite') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.conflict {
  inline-size: min(32rem, 100vw - 2 * var(--pl-space-4));
  padding: var(--pl-space-5);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
  box-shadow: var(--pl-shadow-sheet);
}

.conflict[open] {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-3);
}

.conflict::backdrop {
  background: var(--pl-color-backdrop);
}

.conflict-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-lg);
  font-weight: 600;
}

.conflict-message {
  margin: 0;
}

.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--pl-space-2);
}
</style>
