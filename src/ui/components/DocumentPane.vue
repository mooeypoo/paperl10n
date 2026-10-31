<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { DocumentTextDto, LocaleDto } from '#ipc-contract';
import type { EditorView } from '@codemirror/view';
import { computed, ref, useId, useTemplateRef } from 'vue';
import type { LinkEdit } from '../editor/link-editing';
import type { SectionBars } from '../editor/section-status';
import type { SourceChangeMarks } from '../editor/source-changes';
import type { EditorSnapshot } from '../editor/markdown-editor';
import { isolated, useI18n } from '../i18n/i18n';
import LinkDialog from './LinkDialog.vue';
import MarkdownEditor from './MarkdownEditor.vue';

withDefaults(
  defineProps<{
    heading: string;
    locale: LocaleDto;
    path: string;
    /** `null` once loaded means the file doesn't exist yet. */
    document: DocumentTextDto | null;
    loading: boolean;
    /** The source pane: its text can be read, selected, and copied, but not changed. */
    readOnly: boolean;
    /** The document is the file's text (false for a new translation seeded from the source). */
    saved?: boolean;
    /** Offer "Start translating" when there's no document. */
    startable?: boolean;
    /** Where the paired sections start in `document` (see MarkdownEditor). */
    sectionStarts?: readonly (number | null)[] | null;
    /** Show the section view. */
    sectionsShown?: boolean;
    /** Each section's status bar in the section view (see MarkdownEditor). */
    sectionBars?: SectionBars | null;
    /** What changed in the source since it was marked (see MarkdownEditor). */
    sourceChanges?: SourceChangeMarks | null;
  }>(),
  {
    saved: true,
    startable: false,
    sectionStarts: null,
    sectionsShown: false,
    sectionBars: null,
    sourceChanges: null,
  },
);
const emit = defineEmits<{
  start: [];
  dirty: [dirty: boolean];
  change: [];
  view: [view: EditorView | null];
}>();
const { t, locale: uiLocale, direction: uiDirection } = useI18n();
const headingId = useId();
const editor = useTemplateRef<InstanceType<typeof MarkdownEditor>>('editor');
// A new function when the interface's language changes, so the editor relabels its link chips.
const linkLabel = computed(() => {
  void uiLocale.value;
  return (url: string) => t('paperl10n-link-target', isolated(url));
});
/** The link being edited in the link dialog. */
const linkEdit = ref<LinkEdit | null>(null);

defineExpose({
  /** The editor's text to save, or `null` when no editor is shown. */
  snapshot: (): EditorSnapshot | null => editor.value?.snapshot() ?? null,
  /** How many top-level headings of `depth` the editor's text has now. */
  headingCount: (depth: number): number | null => editor.value?.headingCount(depth) ?? null,
});
</script>

<template>
  <!-- Each pane carries its own language and direction (AGENTS.md, UI and design). Its heading and
       notes are interface text, so they follow the interface's language and direction instead. -->
  <section
    class="pane"
    :lang="locale.id"
    :dir="locale.direction"
    :aria-labelledby="headingId"
    :aria-busy="loading"
  >
    <header class="pane-header" :lang="uiLocale" :dir="uiDirection">
      <div class="pane-title">
        <h3 :id="headingId" class="pane-heading">{{ heading }}</h3>
        <!-- A file path isn't prose in any language: isolate it (bdi). -->
        <p class="pane-path">
          <bdi>{{ path }}</bdi>
        </p>
      </div>
      <slot name="actions" />
    </header>
    <div class="pane-body">
      <div v-if="$slots.notice" class="pane-notices" :lang="uiLocale" :dir="uiDirection">
        <slot name="notice" />
      </div>
      <p v-if="loading" class="pane-note" :lang="uiLocale" :dir="uiDirection">
        {{ t('paperl10n-reading') }}
      </p>
      <div v-else-if="document === null" class="pane-missing" :lang="uiLocale" :dir="uiDirection">
        <p class="pane-note">{{ t('paperl10n-translation-missing') }}</p>
        <button
          v-if="startable"
          type="button"
          class="pl-button"
          data-variant="primary"
          @click="emit('start')"
        >
          {{ t('paperl10n-start-translating') }}
        </button>
      </div>
      <MarkdownEditor
        v-else
        ref="editor"
        :file="document.text"
        :mdx="document.mdx"
        :read-only="readOnly"
        :locale="locale"
        :label="heading"
        :link-label="linkLabel"
        :saved="saved"
        :section-starts="sectionStarts"
        :sections-shown="sectionsShown"
        :section-bars="sectionBars"
        :source-changes="sourceChanges"
        @dirty="(dirty) => emit('dirty', dirty)"
        @change="emit('change')"
        @edit-link="(edit) => (linkEdit = edit)"
        @view="(view) => emit('view', view)"
      />
      <LinkDialog v-if="!readOnly" :edit="linkEdit" :locale="locale" @close="linkEdit = null" />
    </div>
  </section>
</template>

<style scoped>
.pane {
  /* A column, so that when the pane has a set height (a wide window, see DocumentView) the
     editor takes what the header and notes leave, and scrolls inside it. */
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  min-block-size: 0;
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-lg);
  background: var(--pl-color-surface);
  box-shadow: var(--pl-shadow-sheet);
}

.pane-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pl-space-1) var(--pl-space-3);
  padding-block: var(--pl-space-3);
  padding-inline: var(--pl-space-5);
  border-block-end: 1px solid var(--pl-color-line);
}

.pane-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--pl-space-1) var(--pl-space-3);
  flex: 1 1 auto;
  min-inline-size: 0;
}

.pane-notices {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  /* Many notes scroll, leaving the editor most of the pane. */
  max-block-size: 40%;
  overflow-y: auto;
  gap: var(--pl-space-2);
  margin-block-end: var(--pl-space-3);
}

.pane-missing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-3);
}

.pane-heading {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.pane-path {
  margin: 0;
  color: var(--pl-color-muted);
  font-family: var(--pl-font-mono);
  font-size: 0.75rem;
}

.pane-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding-block: var(--pl-space-4) var(--pl-space-5);
  padding-inline: var(--pl-space-5);
}

.pane-note {
  margin: 0;
  color: var(--pl-color-muted);
}
</style>
