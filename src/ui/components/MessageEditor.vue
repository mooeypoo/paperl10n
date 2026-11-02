<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto, PlaceholderTokenDto } from '#ipc-contract';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { createMessageEditor, type MessageEditor } from '../editor/message-editor';

// One message's translation in a CodeMirror editor (editor/message-editor.ts). It starts from
// `text` and owns the text from then on (a new message is a new component: key it by message).
const props = defineProps<{
  /** The text it opens with. */
  text: string;
  /** Tokens main found, and the text it found them in: marked while the text is still that. */
  tokens: { readonly text: string; readonly tokens: readonly PlaceholderTokenDto[] } | null;
  /** The text's language and direction (the target's). */
  locale: LocaleDto;
  label: string;
  placeholder: string;
}>();
const emit = defineEmits<{
  change: [text: string];
  next: [];
  previous: [];
  nextNeedingWork: [];
  previousNeedingWork: [];
  close: [];
}>();

const host = useTemplateRef('host');
let editor: MessageEditor | null = null;

onMounted(() => {
  if (host.value === null) return;
  const start = props.tokens;
  editor = createMessageEditor(host.value, {
    text: props.text,
    tokens: start !== null && start.text === props.text ? start.tokens : [],
    lang: props.locale.id,
    dir: props.locale.direction,
    label: props.label,
    placeholder: props.placeholder,
    onChange: (text) => {
      emit('change', text);
    },
    commands: {
      next: () => {
        emit('next');
      },
      previous: () => {
        emit('previous');
      },
      nextNeedingWork: () => {
        emit('nextNeedingWork');
      },
      previousNeedingWork: () => {
        emit('previousNeedingWork');
      },
      close: () => {
        emit('close');
      },
    },
  });
});
watch(
  () => props.tokens,
  (answer) => {
    if (answer !== null) editor?.setTokens(answer.tokens, answer.text);
  },
);
onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

defineExpose({
  focus: () => {
    editor?.focus();
  },
});
</script>

<template>
  <div ref="host" class="message-editor"></div>
</template>
