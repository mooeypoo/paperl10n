<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { LocaleDto } from '#ipc-contract';
import type { EditorView } from '@codemirror/view';
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import {
  createMarkdownEditor,
  editorState,
  type EditorSnapshot,
  type MarkdownEditor,
  type MarkdownEditorOptions,
} from '../editor/markdown-editor';
import { editorPosition } from '../editor/file-text';
import type { LinkEdit } from '../editor/link-editing';
import type { SectionBars } from '../editor/section-status';
import type { SourceChangeMarks } from '../editor/source-changes';

const props = defineProps<{
  /** The file's exact text. */
  file: string;
  mdx: boolean;
  readOnly: boolean;
  /** The text's language and direction. */
  locale: LocaleDto;
  /** The accessible name of the text area. */
  label: string;
  /** The accessible name of a link chip, from its URL. */
  linkLabel: (url: string) => string;
  /** The text is what the file holds (false for a new translation: unsaved until saved). Read
   * with each new file, so marking a save doesn't restart the editor. */
  saved: boolean;
  /**
   * Where each paired section starts in `file` (its offsets, as main read it), in pair order,
   * `null` where this side lacks one; `null`: not paired. Read with each new file and when it
   * changes; edits move them along from then on.
   */
  sectionStarts?: readonly (number | null)[] | null;
  /** Show the section view: the section marks, lined up with another editor. */
  sectionsShown?: boolean;
  /** Each section's status bar, by pair index, in the section view. */
  sectionBars?: SectionBars | null;
  /** What changed in this source since it was marked, at offsets into `file` (as main read it). */
  sourceChanges?: SourceChangeMarks | null;
}>();
/** `dirty`: the text has unsaved changes (sent on mount, and whenever that changes). `change`:
 * after each edit. `editLink`: show a form for a link, and answer through the request. */
const emit = defineEmits<{
  dirty: [dirty: boolean];
  change: [];
  editLink: [edit: LinkEdit];
  /** The editor's view once mounted, and `null` once gone (to line it up with another). */
  view: [view: EditorView | null];
}>();

const host = useTemplateRef('host');
let editor: MarkdownEditor | null = null;

const options = (): MarkdownEditorOptions => ({
  file: props.file,
  mdx: props.mdx,
  readOnly: props.readOnly,
  lang: props.locale.id,
  dir: props.locale.direction,
  label: props.label,
  linkLabel: props.linkLabel,
  saved: props.saved,
  onDirtyChange: (dirty) => {
    emit('dirty', dirty);
  },
  onChange: () => {
    emit('change');
  },
  onEditLink: (edit) => {
    emit('editLink', edit);
  },
});

const setSectionStarts = () => {
  const starts = props.sectionStarts ?? null;
  editor?.setSectionStarts(
    starts?.map((start) => (start === null ? null : editorPosition(props.file, start))) ?? null,
  );
  editor?.showSections(props.sectionsShown);
  editor?.setSectionBars(props.sectionBars ?? null);
  setSourceChanges();
};

const setSourceChanges = () => {
  const changes = props.sourceChanges ?? null;
  const at = (offset: number) => editorPosition(props.file, offset);
  editor?.setSourceChanges(
    changes === null
      ? null
      : {
          ...changes,
          blocks: changes.blocks.map(({ kind, from, to }) => ({
            kind,
            from: at(from),
            to: at(to),
          })),
          removals: changes.removals.map(({ at: offset, side }) => ({ at: at(offset), side })),
        },
  );
};

onMounted(() => {
  if (host.value === null) return;
  editor = createMarkdownEditor(host.value, options());
  emit('dirty', editor.dirty());
  setSectionStarts();
  emit('view', editor.view);
});
// A different file (or a different way to read it) starts over: new text, new undo history.
watch(
  () => [props.file, props.mdx, props.readOnly],
  () => {
    if (editor === null) return;
    editor.view.setState(editorState(options()));
    emit('dirty', editor.dirty());
    setSectionStarts();
  },
);
// Section starts come with the file they're for (a new pairing keeps the text and its history).
watch(() => props.sectionStarts, setSectionStarts);
watch(
  () => props.sectionBars,
  (bars) => {
    editor?.setSectionBars(bars ?? null);
  },
);
watch(() => props.sourceChanges, setSourceChanges);
// Switching views keeps the starts where edits moved them.
watch(
  () => props.sectionsShown,
  (on) => {
    editor?.showSections(on);
  },
);
// Another label (the interface's language changed) or locale keeps the text: unsaved edits stay.
watch(
  () => [props.locale.id, props.locale.direction, props.label, props.linkLabel],
  () => {
    editor?.present({
      lang: props.locale.id,
      dir: props.locale.direction,
      label: props.label,
      linkLabel: props.linkLabel,
    });
  },
);
onBeforeUnmount(() => {
  emit('view', null);
  editor?.destroy();
  editor = null;
});

defineExpose({
  /** The document as file text, ready to save. */
  text: (): string => editor?.text() ?? props.file,
  /** The text to save, and a way to mark it saved once saving succeeded. */
  snapshot: (): EditorSnapshot =>
    editor?.snapshot() ?? { text: props.file, markSaved: () => undefined },
  /** How many top-level headings of `depth` the text has now (`null`: not known yet). */
  headingCount: (depth: number): number | null => editor?.headingCount(depth) ?? null,
});
</script>

<template>
  <div ref="host" class="markdown-editor" />
</template>

<style scoped>
/* Takes the pane's height when the pane has one (a wide window), so the editor scrolls inside. */
.markdown-editor {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}
</style>
