<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { DocumentPairDto, ErrorDto, LocaleDto, SourceDocumentDto } from '#ipc-contract';
import type { EditorView } from '@codemirror/view';
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { SaveStatus } from '../composables/use-translation-saving';
import type { EditorSnapshot } from '../editor/markdown-editor';
import { alignSections } from '../editor/section-alignment';
import { errorMessage } from '../i18n/error-message';
import { isolated, useI18n } from '../i18n/i18n';
import { autonym } from '../i18n/language-name';
import DocumentPane from './DocumentPane.vue';

const props = defineProps<{
  sourceLocale: LocaleDto;
  targetLocale: LocaleDto;
  document: SourceDocumentDto;
  pair: DocumentPairDto | null;
  loading: boolean;
  error: ErrorDto | null;
  /** A new translation was started from a copy of the source. */
  started: boolean;
  /** The page opened with a draft from an earlier session: the editor shows the draft's text. */
  restored: boolean;
  /** Say that the draft was restored, offering to discard it. */
  restoredNotice: boolean;
  draftError: ErrorDto | null;
  /** The translation has no file yet. */
  isNew: boolean;
  saveStatus: SaveStatus;
  saveError: ErrorDto | null;
}>();
const emit = defineEmits<{
  start: [];
  dirty: [dirty: boolean];
  change: [];
  save: [];
  discardRestored: [];
}>();
const { t } = useI18n();
// Only the pair for this page counts: while the next page loads, the previous one isn't shown.
const current = computed(() => (props.pair?.key === props.document.key ? props.pair : null));
const waiting = computed(() => props.loading || (current.value === null && props.error === null));
// The translation as the editor starts: a restored draft's text, the file, or (for a new
// translation) a byte-for-byte copy of the source.
const target = computed(() => {
  const pair = current.value;
  if (pair === null) return null;
  const file = pair.target ?? (props.started ? pair.source : null);
  if (props.restored && pair.draft !== null) {
    return { ...(pair.target ?? pair.source), text: pair.draft.text };
  }
  return file;
});
// A restored draft started from a text the file no longer has: saving will ask what to keep.
const restoredFromOlder = computed(() => {
  const pair = current.value;
  const draft = pair?.draft ?? null;
  return draft !== null && draft.base !== (pair?.target?.text ?? null);
});
// The editor starts clean only on the file's own text.
const targetSaved = computed(() => !props.restored && (current.value?.target ?? null) !== null);
const statusText = computed(() =>
  props.saveStatus === 'clean' ? '' : t(`paperl10n-save-status-${props.saveStatus}`),
);
const targetPane = useTemplateRef<InstanceType<typeof DocumentPane>>('targetPane');

// The section view (docs/plan/M3-sections.md). Main paired the sections when the page opened, for
// the text the translation opens with; the view is chosen then and stays as it opened until the
// page is read again.
const sections = computed(() => current.value?.sections ?? null);
// The text the pairing is for: the draft, else the file, else a copy of the source.
const pairedText = computed(() => {
  const pair = current.value;
  return pair === null ? null : (pair.draft?.text ?? pair.target?.text ?? pair.source.text);
});
// The translation editor shows that text (not after discarding a restored draft, say).
const pairable = computed(
  () =>
    sections.value?.paired === true &&
    target.value !== null &&
    target.value.text === pairedText.value,
);
// The view asked for. Each page asks for sections; it shows them only when they pair.
const mode = ref<'sections' | 'full'>('sections');
const sectionsChanged = ref(false);
watch(
  current,
  () => {
    mode.value = 'sections';
    sectionsChanged.value = false;
  },
  { immediate: true },
);
const sectionView = computed(() => mode.value === 'sections' && pairable.value);
// Set once per pairing (switching views doesn't reset them: the editors keep them where edits
// moved them).
const starts = (side: 'source' | 'target') => {
  const pairing = sections.value;
  if (!pairable.value || pairing?.paired !== true) return null;
  return pairing.pairs.map((pair) => pair[side]?.start ?? null);
};
const sourceStarts = computed(() => starts('source'));
const targetStarts = computed(() => starts('target'));

// The editors line up while both are shown in the section view.
const sourceView = shallowRef<EditorView | null>(null);
const targetView = shallowRef<EditorView | null>(null);
watch(
  [sourceView, targetView, sectionView],
  ([source, translation, on], _previous, onCleanup) => {
    if (source !== null && translation !== null && on)
      onCleanup(alignSections(source, translation));
  },
  { flush: 'post' },
);

// Editing that adds or removes a heading at the split level leaves the view as it is, and says so.
let checkTimer: ReturnType<typeof setTimeout> | undefined;
function checkSections(): void {
  const pairing = sections.value;
  if (!sectionView.value || pairing?.paired !== true || pairing.level === null) return;
  const { level } = pairing;
  const expected = pairing.pairs.filter((pair) => pair.kind === 'heading').length;
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    const count = targetPane.value?.headingCount(level) ?? null;
    if (count !== null) sectionsChanged.value = count !== expected;
  }, 300);
}
onBeforeUnmount(() => {
  clearTimeout(checkTimer);
});
// Why the page shows in full, when its sections didn't pair as it opened.
const unpairedNote = computed(() => {
  const pairing = sections.value;
  if (pairing === null || pairing.paired || target.value === null) return '';
  return pairing.reason === 'count'
    ? t(
        'paperl10n-sections-unpaired-count',
        String(pairing.targetCount),
        String(pairing.sourceCount),
      )
    : t('paperl10n-sections-unpaired-level');
});
// The sections no longer match the pairing (edited, or a restored draft discarded).
const changedNote = computed(
  () =>
    mode.value === 'sections' &&
    sections.value?.paired === true &&
    target.value !== null &&
    (sectionsChanged.value || !pairable.value),
);

defineExpose({
  /** The translation editor's text to save, or `null` when there's no editor. */
  snapshot: (): EditorSnapshot | null => targetPane.value?.snapshot() ?? null,
});
</script>

<template>
  <article class="document">
    <!-- Stays in view while the page scrolls, so its notes are seen where the typing is. -->
    <div class="document-top">
      <header class="document-header">
        <h2 class="document-title">
          <bdi>{{ document.key }}</bdi>
        </h2>
        <div
          v-if="current !== null && target !== null && error === null"
          class="document-views"
          role="group"
          :aria-label="t('paperl10n-view-label')"
        >
          <button
            type="button"
            class="pl-button"
            :aria-pressed="sectionView"
            :disabled="!pairable"
            @click="mode = 'sections'"
          >
            {{ t('paperl10n-view-sections') }}
          </button>
          <button
            type="button"
            class="pl-button"
            :aria-pressed="!sectionView"
            @click="mode = 'full'"
          >
            {{ t('paperl10n-view-full') }}
          </button>
        </div>
      </header>
      <p v-if="unpairedNote !== '' && !waiting" class="document-note document-sections-note">
        {{ unpairedNote }}
      </p>
      <p v-if="changedNote && !waiting" class="document-note document-sections-note" role="status">
        {{ t('paperl10n-sections-changed') }}
      </p>
    </div>
    <div v-if="error !== null" class="document-error" role="alert">
      {{ errorMessage(error, t) }}
    </div>
    <div v-else class="document-panes">
      <DocumentPane
        :heading="t('paperl10n-source-pane', autonym(sourceLocale.id))"
        :locale="sourceLocale"
        :path="document.sourcePath"
        :document="current?.source ?? null"
        :loading="waiting"
        :section-starts="sourceStarts"
        :sections-shown="sectionView"
        read-only
        @view="(view) => (sourceView = view)"
      />
      <DocumentPane
        ref="targetPane"
        :heading="t('paperl10n-target-pane', autonym(targetLocale.id))"
        :locale="targetLocale"
        :path="document.targetPath"
        :document="target"
        :loading="waiting"
        :read-only="false"
        :saved="targetSaved"
        :section-starts="targetStarts"
        :sections-shown="sectionView"
        startable
        @start="emit('start')"
        @dirty="(dirty) => emit('dirty', dirty)"
        @change="
          emit('change');
          checkSections();
        "
        @view="(view) => (targetView = view)"
      >
        <template v-if="target !== null && !waiting" #actions>
          <div class="document-save">
            <span class="document-save-status" role="status">{{ statusText }}</span>
            <button
              type="button"
              class="pl-button"
              data-variant="primary"
              aria-keyshortcuts="Control+S Meta+S"
              :disabled="saveStatus !== 'unsaved'"
              @click="emit('save')"
            >
              {{ t('paperl10n-save') }}
            </button>
          </div>
        </template>
        <template
          v-if="
            (saveError !== null || draftError !== null || restoredNotice || (started && isNew)) &&
            !waiting
          "
          #notice
        >
          <p v-if="saveError !== null" class="document-error" role="alert">
            {{ errorMessage(saveError, t) }}
          </p>
          <p v-if="draftError !== null" class="document-error" role="alert">
            {{ errorMessage(draftError, t) }}
          </p>
          <div v-if="restoredNotice" class="document-restored">
            <p class="document-note">
              {{
                t(
                  restoredFromOlder
                    ? 'paperl10n-draft-restored-changed'
                    : 'paperl10n-draft-restored',
                )
              }}
            </p>
            <button type="button" class="pl-button" @click="emit('discardRestored')">
              {{ t('paperl10n-discard-draft') }}
            </button>
          </div>
          <p v-if="started && isNew" class="document-note">
            {{ t('paperl10n-new-translation', isolated(document.targetPath)) }}
          </p>
        </template>
      </DocumentPane>
    </div>
  </article>
</template>

<style scoped>
.document {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
}

.document-top {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  padding-block: var(--pl-space-2);
  background: var(--pl-color-bg);
}

.document-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pl-space-2) var(--pl-space-4);
}

.document-views {
  display: flex;
  gap: var(--pl-space-1);
}

.document-title {
  margin: 0;
  font-family: var(--pl-font-text);
  font-size: var(--pl-text-xl);
  font-weight: 600;
}

.document-panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: var(--pl-space-5);
  align-items: start;
}

.document-save {
  display: flex;
  align-items: center;
  gap: var(--pl-space-3);
}

.document-save-status {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.document-restored {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-3);
}

.document-note {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.document-error {
  margin: 0;
  padding: var(--pl-space-3) var(--pl-space-4);
  border: 1px solid var(--pl-color-danger);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
}
</style>
