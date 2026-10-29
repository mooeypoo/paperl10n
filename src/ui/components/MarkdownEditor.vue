<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import {
  createMarkdownEditor,
  editorState,
  type MarkdownEditor,
  type MarkdownEditorOptions,
} from '../editor/markdown-editor';

const props = defineProps<{
  /** The file's exact text. */
  file: string;
  mdx: boolean;
  readOnly: boolean;
  /** The text's language and direction. */
  locale: LocaleDto;
  /** The accessible name of the text area. */
  label: string;
}>();
const emit = defineEmits<{ edit: [] }>();

const host = useTemplateRef('host');
let editor: MarkdownEditor | null = null;

const options = (): MarkdownEditorOptions => ({
  file: props.file,
  mdx: props.mdx,
  readOnly: props.readOnly,
  lang: props.locale.id,
  dir: props.locale.direction,
  label: props.label,
  onEdit: () => {
    emit('edit');
  },
});

onMounted(() => {
  if (host.value !== null) editor = createMarkdownEditor(host.value, options());
});
// A different file (or a different way to read it) starts over: new text, new undo history.
watch(
  () => [
    props.file,
    props.mdx,
    props.readOnly,
    props.locale.id,
    props.locale.direction,
    props.label,
  ],
  () => editor?.view.setState(editorState(options())),
);
onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

defineExpose({
  /** The document as file text, ready to save. */
  text: (): string => editor?.text() ?? props.file,
});
</script>

<template>
  <div ref="host" class="markdown-editor" />
</template>
