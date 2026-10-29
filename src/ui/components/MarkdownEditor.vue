<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import {
  createMarkdownEditor,
  editorState,
  type EditorSnapshot,
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
  /** The text is what the file holds (false for a new translation: unsaved until saved). Read
   * with each new file, so marking a save doesn't restart the editor. */
  saved: boolean;
}>();
/** `dirty`: the text has unsaved changes (sent on mount, and whenever that changes). `change`:
 * after each edit. */
const emit = defineEmits<{ dirty: [dirty: boolean]; change: [] }>();

const host = useTemplateRef('host');
let editor: MarkdownEditor | null = null;

const options = (): MarkdownEditorOptions => ({
  file: props.file,
  mdx: props.mdx,
  readOnly: props.readOnly,
  lang: props.locale.id,
  dir: props.locale.direction,
  label: props.label,
  saved: props.saved,
  onDirtyChange: (dirty) => {
    emit('dirty', dirty);
  },
  onChange: () => {
    emit('change');
  },
});

onMounted(() => {
  if (host.value === null) return;
  editor = createMarkdownEditor(host.value, options());
  emit('dirty', editor.dirty());
});
// A different file (or a different way to read it) starts over: new text, new undo history.
watch(
  () => [props.file, props.mdx, props.readOnly],
  () => {
    if (editor === null) return;
    editor.view.setState(editorState(options()));
    emit('dirty', editor.dirty());
  },
);
// Another label (the interface's language changed) or locale keeps the text: unsaved edits stay.
watch(
  () => [props.locale.id, props.locale.direction, props.label],
  () => {
    editor?.present({ lang: props.locale.id, dir: props.locale.direction, label: props.label });
  },
);
onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

defineExpose({
  /** The document as file text, ready to save. */
  text: (): string => editor?.text() ?? props.file,
  /** The text to save, and a way to mark it saved once saving succeeded. */
  snapshot: (): EditorSnapshot =>
    editor?.snapshot() ?? { text: props.file, markSaved: () => undefined },
});
</script>

<template>
  <div ref="host" class="markdown-editor" />
</template>
