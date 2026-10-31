<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type {
  DocumentPairDto,
  DocumentStatusDto,
  ErrorDto,
  LocaleDto,
  PageStatusDto,
  SectionStatusDto,
  SourceDocumentDto,
  TranslationCheckDto,
} from '#ipc-contract';
import type { EditorView } from '@codemirror/view';
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type { SaveStatus } from '../composables/use-translation-saving';
import type { EditorSnapshot } from '../editor/markdown-editor';
import { scrollSync } from '../editor/scroll-sync';
import { alignSections } from '../editor/section-alignment';
import type { SectionBar, SectionBars } from '../editor/section-status';
import type { SourceChangeMarks } from '../editor/source-changes';
import { errorMessage } from '../i18n/error-message';
import { hintMessages } from '../i18n/hint-message';
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
  /** The page's status (from the pair, then as marking changed it). */
  status?: DocumentStatusDto | null;
  /** Marking the page up to date is on its way. */
  marking?: boolean;
  markError?: ErrorDto | null;
  /** The translation as written, checked against its source: hints and lengths. */
  check?: TranslationCheckDto | null;
}>();
const emit = defineEmits<{
  start: [];
  dirty: [dirty: boolean];
  change: [];
  save: [];
  discardRestored: [];
  markPage: [];
  /** Mark one source section up to date, by its index among the source's sections. */
  markSection: [index: number];
  /** Read the page again (its source changed on disk). */
  reopen: [];
}>();
const { t, locale: uiLocale, direction: uiDirection } = useI18n();
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
// Each pane scrolls on its own (in a window wide enough for both side by side), and they scroll
// together: locked in the section view, loosely in the full page unless that's turned off. The
// translation keeps its place when they start.
const scrollTogether = ref(true);
watch(
  [sourceView, targetView, sectionView, scrollTogether],
  ([source, translation, sectionsOn, together], _previous, onCleanup) => {
    if (source !== null && translation !== null && (sectionsOn || together))
      onCleanup(scrollSync(translation, source));
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

// Status (docs/domains/translation.md): shown once the translation has a file.
const statusNames: Readonly<Record<PageStatusDto, string>> = {
  missing: 'paperl10n-status-missing',
  draft: 'paperl10n-status-draft',
  translated: 'paperl10n-status-translated',
  outdated: 'paperl10n-status-outdated',
};
const shownStatus = computed(() => {
  const status = props.status ?? null;
  return current.value === null || status === null || status.page === 'missing' ? null : status;
});
// Each section's status, at its heading in the translation pane, in the section view.
const onMarkSection = (pairIndex: number) => {
  const pairing = sections.value;
  if (pairing?.paired !== true) return;
  // The status lists the source's sections: pairs before this one with a source side.
  const index = pairing.pairs.slice(0, pairIndex).filter((pair) => pair.source !== null).length;
  emit('markSection', index);
};
/** Bars by pair index, from each source section's status and its index among them. */
const barsBySection = (
  bar: (
    section: SectionStatusDto,
    index: number,
    count: number,
    pairIndex: number,
  ) => SectionBar | null,
  onMark: (pairIndex: number) => void,
): SectionBars | null => {
  const status = shownStatus.value;
  const pairing = sections.value;
  if (status === null || pairing?.paired !== true) return null;
  let index = -1;
  const count = status.sections.length;
  return {
    bars: pairing.pairs.map((pair, pairIndex) => {
      if (pair.source === null) return null;
      index++;
      const section = status.sections[index];
      return section === undefined ? null : bar(section, index, count, pairIndex);
    }),
    onMark,
    lang: uiLocale.value,
    dir: uiDirection.value,
  };
};
// Preservation hints: each section's at its bar, while the text still pairs as the page opened;
// otherwise the page's, above the translation.
const hintTexts = (hints: TranslationCheckDto['page']) =>
  hints.flatMap((hint) => hintMessages(hint, t));
const sectionHints = computed(() => {
  const found = props.check?.sections ?? null;
  const pairing = sections.value;
  if (!sectionView.value || sectionsChanged.value || found === null || pairing?.paired !== true) {
    return null;
  }
  return found.length === pairing.pairs.length ? found.map(hintTexts) : null;
});
const sectionBars = computed(() =>
  barsBySection(
    (section, index, count, pairIndex) => ({
      status: section,
      statusLabel: t(statusNames[section]),
      mark:
        section === 'translated'
          ? null
          : {
              label: t('paperl10n-mark-section'),
              name: t('paperl10n-mark-section-name', String(index + 1), String(count)),
            },
      busy: props.marking ?? false,
      hints: sectionHints.value?.[pairIndex] ?? [],
    }),
    onMarkSection,
  ),
);
const pageHints = computed(() =>
  props.check === undefined ||
  props.check === null ||
  (sectionHints.value !== null && sectionBars.value !== null)
    ? []
    : hintTexts(props.check.page),
);
// How long the translation is, against its source, as rendered (to the nearest 5%).
const lengthNote = computed(() => {
  const length = props.check?.length;
  if (length === undefined || length.source === 0) return '';
  return t('paperl10n-length-note', Math.round((length.translation / length.source) * 20) * 5);
});
// In the source pane, at the heading of each section whose source changed since it was marked.
const noMark = () => undefined;
const sourceBars = computed(() =>
  barsBySection(
    (section) =>
      section === 'outdated'
        ? {
            status: section,
            statusLabel: t('paperl10n-source-changed'),
            mark: null,
            busy: false,
            hints: [],
          }
        : null,
    noMark,
  ),
);
// What changed in the source since it was marked: highlighted in the source pane, in both views.
const sourceChanges = computed((): SourceChangeMarks | null => {
  const changes = shownStatus.value?.changes;
  if (changes === undefined || (changes.blocks.length === 0 && changes.removals.length === 0)) {
    return null;
  }
  return {
    blocks: changes.blocks.map(({ kind, range }) => ({ kind, from: range.start, to: range.end })),
    removals: changes.removals.map(({ offset, side }) => ({ at: offset, side })),
    removedLabel: t('paperl10n-source-removed'),
    lang: uiLocale.value,
    dir: uiDirection.value,
  };
});
const markErrorText = computed(() =>
  props.markError === undefined || props.markError === null ? '' : errorMessage(props.markError, t),
);
const sectionsUpToDate = computed(
  () => shownStatus.value?.sections.filter((section) => section === 'translated').length ?? 0,
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
        <div v-if="current !== null && target !== null && error === null" class="document-controls">
          <div class="document-views" role="group" :aria-label="t('paperl10n-view-label')">
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
          <!-- Only where the panes scroll on their own (a wide window), and only in the full page:
               the section view always scrolls them together. -->
          <button
            v-if="!sectionView"
            type="button"
            class="pl-button document-scroll-together"
            :aria-pressed="scrollTogether"
            @click="scrollTogether = !scrollTogether"
          >
            {{ t('paperl10n-scroll-together') }}
          </button>
        </div>
      </header>
      <div v-if="shownStatus !== null && !waiting && error === null" class="document-status">
        <span class="document-status-name" :data-status="shownStatus.page">
          {{ t(statusNames[shownStatus.page]) }}
        </span>
        <span v-if="shownStatus.sections.length > 1" class="document-note">
          {{ t('paperl10n-sections-progress', sectionsUpToDate, shownStatus.sections.length) }}
        </span>
        <span v-if="sourceChanges !== null" class="document-note document-changes-note">
          {{ t('paperl10n-source-changes-note') }}
        </span>
        <button
          v-if="shownStatus.page !== 'translated'"
          type="button"
          class="pl-button"
          :disabled="marking"
          @click="emit('markPage')"
        >
          {{ t('paperl10n-mark-page') }}
        </button>
      </div>
      <div v-if="markErrorText !== '' && !waiting" class="document-error" role="alert">
        <p>{{ markErrorText }}</p>
        <button
          v-if="markError?.code === 'workspace.source-changed'"
          type="button"
          class="pl-button"
          @click="emit('reopen')"
        >
          {{ t('paperl10n-reopen-page') }}
        </button>
      </div>
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
        :section-bars="sourceBars"
        :source-changes="sourceChanges"
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
        :section-bars="sectionBars"
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
            <span v-if="lengthNote !== ''" class="document-length">{{ lengthNote }}</span>
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
            (saveError !== null ||
              draftError !== null ||
              restoredNotice ||
              (started && isNew) ||
              pageHints.length > 0) &&
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
          <div v-if="pageHints.length > 0" class="document-hints">
            <p class="document-note">{{ t('paperl10n-hints-title') }}</p>
            <ul>
              <li v-for="hint in pageHints" :key="hint">{{ hint }}</li>
            </ul>
          </div>
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

.document-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-4);
}

.document-views {
  display: flex;
  gap: var(--pl-space-1);
}

.document-scroll-together {
  display: none;
}

.document-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-3);
}

.document-status-name {
  padding-block: 0.1rem;
  padding-inline: var(--pl-space-2);
  border: 1px solid var(--pl-color-line);
  border-inline-start: 3px solid var(--pl-color-muted);
  border-radius: var(--pl-radius-md);
  font-size: var(--pl-text-sm);
}

.document-status-name[data-status='translated'] {
  border-inline-start-color: var(--pl-color-ok);
}

.document-status-name[data-status='outdated'] {
  border-inline-start-color: var(--pl-color-warn);
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

/* Wide enough for the panes side by side (the same width as App's): the page fills the main
   area, and each pane fills the height left below the page's notes, its editor scrolling inside
   it. Many notes leave the panes a minimum, and the main area scrolls instead. */
@media (min-width: 64rem) {
  .document {
    flex: 1 1 auto;
    min-block-size: 0;
  }

  .document-panes {
    flex: 1 1 0;
    min-block-size: 24rem;
    align-items: stretch;
  }

  .document-scroll-together {
    display: inline-block;
  }
}

.document-save {
  display: flex;
  align-items: center;
  gap: var(--pl-space-3);
}

.document-save-status,
.document-length {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

/* Neutral notes, not errors: muted, with a plain rule at the inline start. */
.document-hints {
  padding-inline-start: var(--pl-space-3);
  border-inline-start: 3px solid var(--pl-color-line);
}

.document-hints ul {
  margin: var(--pl-space-1) 0 0;
  padding-inline-start: var(--pl-space-4);
  color: var(--pl-color-ink);
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

.document-error p {
  margin: 0;
}

.document-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-3);
  margin: 0;
  padding: var(--pl-space-3) var(--pl-space-4);
  border: 1px solid var(--pl-color-danger);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
}
</style>
