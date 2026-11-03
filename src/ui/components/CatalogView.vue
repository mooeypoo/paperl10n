<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  ErrorDto,
  LocaleDto,
  MessageStatusDto,
} from '#ipc-contract';
import { computed, nextTick, ref, toRef, useTemplateRef, watch } from 'vue';
import { useClient } from '../client';
import { filterMessages, needsWork, type StatusFilter } from '../catalog/message-filter';
import { stepTo, type Step } from '../catalog/message-navigation';
import { visibleKey } from '../catalog/visible-key';
import { diffWords } from '../catalog/word-diff';
import { useMessageCheck } from '../composables/use-message-check';
import type { CatalogSaveStatus } from '../composables/use-catalog-saving';
import type { MessageEdits } from '../composables/use-message-edits';
import { errorMessage } from '../i18n/error-message';
import { isolated, useI18n } from '../i18n/i18n';
import { useVirtualRows } from '../composables/use-virtual-rows';
import { autonym } from '../i18n/language-name';
import { warningMessage } from '../i18n/warning-message';
import AppIcon from './AppIcon.vue';
import MessageEditor from './MessageEditor.vue';
import MessagePreview from './MessagePreview.vue';
import MessageText from './MessageText.vue';

// A catalog's messages: one row per source message (key, source, translation, status), with
// search and a status filter, and the translation's keys the source no longer has listed apart.
// Each text column carries its language and direction. Rows are a fixed height, long texts
// clamped to two lines, so only the rows in view are rendered (5,000 rows took a second). One row
// at a time opens, taller: the whole source, its documentation, and an editor for the translation,
// checked in main as it's written; keys move between messages from there.
const props = defineProps<{
  projectId: string;
  detail: CatalogDetailDto | null;
  loading: boolean;
  error: ErrorDto | null;
  sourceLocale: LocaleDto;
  targetLocale: LocaleDto;
  /** The catalog's edits: App keeps them, to save them and to ask before leaving them. */
  editing: MessageEdits;
  saveStatus: CatalogSaveStatus;
  saveError: ErrorDto | null;
  /** Saved, but not recorded as up to date: why. */
  statusProblem: ErrorDto | null;
  /** The edits are a draft from an earlier session (some changed on disk since: `FromOlder`). */
  restoredNotice?: boolean;
  restoredFromOlder?: boolean;
  /** Keeping the edits as a draft failed. */
  draftError?: ErrorDto | null;
}>();
/** `save`: save every edit (also Ctrl/Cmd+S, App's). `keep`: keep an outdated message as up to date. */
const emit = defineEmits<{
  save: [];
  keep: [message: CatalogMessageDto];
  /** Drop the restored draft's edits. */
  discardRestored: [];
}>();
const { t, locale: uiLocale, direction: uiDirection } = useI18n();

const query = ref('');
const status = ref<StatusFilter>('all');
// Another catalog starts with every message showing.
watch(
  () => props.detail?.key,
  () => {
    query.value = '';
    status.value = 'all';
  },
);
const messages = computed(() => props.detail?.messages ?? []);
const shown = computed(() => filterMessages(messages.value, query.value, status.value));

const editing = props.editing;
/** Where the open message is among those shown (`null`: none open, or filtered out). */
const openIndex = computed(() => {
  const index = shown.value.findIndex((message) => message.key === editing.open.value);
  return index === -1 ? null : index;
});
const openMessage = computed(() =>
  openIndex.value === null ? null : (shown.value[openIndex.value] ?? null),
);
/**
 * How many plural forms a message's translation has fields for: the target language's (none
 * when its catalog keeps no forms apart), else as many as it or its source has.
 */
const formCount = (message: CatalogMessageDto) =>
  message.sourceForms === null && message.translationForms === null
    ? 0
    : (props.detail?.pluralForms.length ?? 0) ||
      (message.translationForms?.length ?? 0) ||
      (message.sourceForms?.length ?? 0);
const checking = useMessageCheck(
  useClient(),
  toRef(props, 'projectId'),
  computed(() => props.detail?.key ?? null),
  editing.open,
  () => (openMessage.value === null ? null : editing.textOf(openMessage.value)),
  {
    currentForms: () => {
      const message = openMessage.value;
      const count = message === null ? 0 : formCount(message);
      return message === null || count === 0 ? null : editing.formsOf(message, count);
    },
  },
);
watch(checking.check, (answer) => {
  if (answer !== null) editing.remember(answer.key, answer.text, answer.tokens);
});
/** The open message's warnings, when it has no forms (a plural's are under each form). */
const warnings = computed(() =>
  checking.check.value?.forms === null ? checking.check.value.warnings : [],
);
/** A plural form's warnings, as main last found them. */
const formWarnings = (index: number) => checking.check.value?.forms?.[index]?.warnings ?? [];

/** A form's tokens and the text they're for: main's answer for it, else the file's. */
function formTokens(message: CatalogMessageDto, index: number) {
  const answer = checking.check.value;
  const checked = answer?.forms?.[index];
  const text = answer?.formTexts?.[index];
  if (checked !== undefined && text !== undefined) return { text, tokens: checked.tokens };
  return message.translationForms?.[index] ?? null;
}

/** What a plural form is for: the first counts that take it ("For 0, 3, 4, 5…"), else its number. */
function formLabel(index: number): string {
  const samples = props.detail?.pluralForms[index]?.samples ?? [];
  if (samples.length === 0) return t('paperl10n-message-form-numbered', index + 1);
  const counts = samples.join(', ') + (samples.length > 1 ? '…' : '');
  return t('paperl10n-message-form', isolated(counts));
}

/** A source form's name: a singular and a plural (gettext's `msgid`, `msgid_plural`), else its number. */
const sourceFormLabel = (index: number, count: number) =>
  count === 2
    ? t(index === 0 ? 'paperl10n-message-source-singular' : 'paperl10n-message-source-plural')
    : t('paperl10n-message-form-numbered', index + 1);

function onEditForm(message: CatalogMessageDto, index: number, text: string): void {
  const forms = editing.formsOf(message, formCount(message));
  forms[index] = text;
  editing.editForms(message, forms);
  checking.refresh();
}

/** A row's height before one is rendered to measure: `--catalog-row-height` at 16 px per rem. */
const ROW_HEIGHT_FALLBACK = 72;
const scrollBox = useTemplateRef<HTMLElement>('scrollBox');
const rows = useVirtualRows(
  scrollBox,
  computed(() => shown.value.length),
  ROW_HEIGHT_FALLBACK,
  openIndex,
);
const rendered = computed(() =>
  shown.value
    .slice(rows.window.value.start, rows.window.value.end)
    .map((message, offset) => ({ message, index: rows.window.value.start + offset })),
);
// Another search, filter, or catalog starts at the top (a catalog read again after a save keeps
// its place).
watch([query, status, () => props.detail?.key], async () => {
  if (scrollBox.value !== null) scrollBox.value.scrollTop = 0;
  await nextTick();
  rows.measure();
});

/** Marks every message the source no longer has for removal (each saved with the rest). */
function removeAll(): void {
  for (const message of props.detail?.notInSource ?? []) {
    editing.remove(message.key, message.text);
  }
}

/** What the header says about saving: how many messages wait, or that they're saved. */
const saveStatusText = computed(() => {
  if (props.saveStatus === 'unsaved') {
    return t('paperl10n-catalog-unsaved', editing.count.value);
  }
  return props.saveStatus === 'clean' ? '' : t(`paperl10n-save-status-${props.saveStatus}`);
});

/** The open message's editor, to focus it. */
let openEditor: { focus(): void } | null = null;
const setEditor = (component: unknown) => {
  openEditor = component as { focus(): void } | null;
};
/** A later plural form's editor: the first one takes the focus. */
const noRef = () => undefined;

/** What the last move between messages found: nothing further that way, or `null`. */
const moveNote = ref<string | null>(null);
watch(editing.open, () => {
  moveNote.value = null;
});

/** Opens the message shown at `index`, scrolls it into view, and puts the caret in its editor. */
async function openAt(index: number): Promise<void> {
  const message = shown.value[index];
  if (message === undefined) return;
  editing.open.value = message.key;
  rows.scrollToRow(index);
  await nextTick();
  // Now rendered: measured at its open height, and scrolled to show all of it.
  rows.measure();
  rows.scrollToRow(index);
  await nextTick();
  openEditor?.focus();
}

/** Closes the open message, and gives the focus back to its row. */
async function close(): Promise<void> {
  const key = editing.open.value;
  editing.open.value = null;
  await nextTick();
  rows.measure();
  const row = [...(scrollBox.value?.querySelectorAll<HTMLElement>('tr[data-row]') ?? [])].find(
    (candidate) => candidate.dataset.key === key,
  );
  row?.querySelector<HTMLButtonElement>('.catalog-row-button')?.focus();
}

function toggle(index: number, key: string): void {
  if (editing.open.value === key) void close();
  else void openAt(index);
}

/** A message needing work (missing or outdated) that hasn't been written since it opened. */
const stillNeedsWork = (index: number) => {
  const message = shown.value[index];
  return message !== undefined && needsWork(message.status) && !editing.isEdited(message.key);
};

/** Moves to the next or previous message (`needingWork`: the next one needing work). */
function move(step: Step, needingWork: boolean): void {
  const to = stepTo(
    shown.value.length,
    openIndex.value,
    step,
    needingWork ? stillNeedsWork : undefined,
  );
  if (to !== null) {
    void openAt(to);
    return;
  }
  moveNote.value = t(
    needingWork
      ? step === 1
        ? 'paperl10n-message-none-needing-work-after'
        : 'paperl10n-message-none-needing-work-before'
      : step === 1
        ? 'paperl10n-message-last'
        : 'paperl10n-message-first',
  );
}

/** The keys, each isolated: "Alt+↓" in a Hebrew sentence must not read "↓+Alt". */
const keysHint = computed(() =>
  t('paperl10n-message-keys', ...['Alt+↓', 'Alt+↑', 'Shift', 'Esc'].map((key) => isolated(key))),
);

function onEdit(message: CatalogMessageDto, text: string): void {
  editing.edit(message, text);
  checking.refresh();
}

/** The tokens of the open editor's text, as main last found them (`[]`: not known yet). */
const startTokens = (message: CatalogMessageDto) => {
  const shownText = editing.shown(message);
  return { text: shownText?.text ?? '', tokens: shownText?.tokens ?? [] };
};

/** What the preview renders: main's latest answer (none while another message's is pending),
 * else the text's tokens as last known. Its tokens must be for the text it renders. */
const previewSource = computed(() => {
  const message = openMessage.value;
  if (message === null) return null;
  const answer = checking.check.value;
  return answer !== null ? { text: answer.text, tokens: answer.tokens } : startTokens(message);
});

const statusNames: Readonly<Record<MessageStatusDto, string>> = {
  missing: 'paperl10n-status-missing',
  draft: 'paperl10n-message-status-draft',
  translated: 'paperl10n-status-translated',
  outdated: 'paperl10n-status-outdated',
};
const filters: readonly { readonly value: StatusFilter; readonly name: string }[] = [
  { value: 'all', name: 'paperl10n-filter-all' },
  { value: 'needs-work', name: 'paperl10n-filter-needs-work' },
  { value: 'missing', name: statusNames.missing },
  { value: 'outdated', name: statusNames.outdated },
  { value: 'draft', name: statusNames.draft },
  { value: 'translated', name: statusNames.translated },
];
</script>

<template>
  <article class="catalog" :aria-busy="loading">
    <div v-if="error !== null" class="catalog-error" role="alert">
      <p>{{ errorMessage(error, t) }}</p>
    </div>
    <template v-else-if="detail !== null">
      <header class="catalog-header">
        <h2 class="catalog-title">
          <bdi>{{ detail.key }}</bdi>
        </h2>
        <p class="catalog-paths">
          <bdi dir="ltr">{{ detail.sourcePath }}</bdi>
          <span aria-hidden="true"> → </span>
          <bdi dir="ltr">{{ detail.targetPath }}</bdi>
          <template v-if="!detail.targetExists">
            · {{ t('paperl10n-catalog-no-translation-file') }}
          </template>
        </p>
        <div class="catalog-save">
          <span class="catalog-save-status" role="status">{{ saveStatusText }}</span>
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
      </header>
      <p v-if="saveError !== null" class="catalog-warning" role="alert">
        {{ errorMessage(saveError, t) }}
      </p>
      <p v-if="draftError != null" class="catalog-warning" role="alert">
        {{ errorMessage(draftError, t) }}
      </p>
      <div v-if="restoredNotice" class="catalog-restored">
        <p class="catalog-note">
          {{
            t(
              restoredFromOlder
                ? 'paperl10n-catalog-draft-restored-changed'
                : 'paperl10n-draft-restored',
            )
          }}
        </p>
        <button type="button" class="pl-button" @click="emit('discardRestored')">
          {{ t('paperl10n-discard-draft') }}
        </button>
      </div>
      <p v-if="statusProblem !== null" class="catalog-warning" role="alert">
        {{ t('paperl10n-catalog-saved-not-recorded') }}
        {{ errorMessage(statusProblem, t) }}
      </p>
      <p v-if="detail.documentationProblem !== null" class="catalog-warning" role="alert">
        {{ t('paperl10n-documentation-unreadable') }}
        {{ errorMessage(detail.documentationProblem, t) }}
      </p>

      <div class="catalog-tools">
        <label class="catalog-search">
          <span class="visually-hidden">{{ t('paperl10n-find-message') }}</span>
          <AppIcon name="search" :size="16" />
          <input
            v-model="query"
            type="search"
            :placeholder="t('paperl10n-find-message-placeholder')"
          />
        </label>
        <label class="catalog-filter">
          <span>{{ t('paperl10n-message-filter') }}</span>
          <select v-model="status">
            <option v-for="filter in filters" :key="filter.value" :value="filter.value">
              {{ t(filter.name) }}
            </option>
          </select>
        </label>
        <span class="catalog-count" role="status">
          {{ t('paperl10n-messages-showing', shown.length, messages.length) }}
        </span>
      </div>

      <div v-if="shown.length > 0" ref="scrollBox" class="catalog-scroll">
        <table class="catalog-messages" :aria-rowcount="shown.length + 1">
          <thead>
            <tr aria-rowindex="1">
              <th scope="col">{{ t('paperl10n-column-message') }}</th>
              <th scope="col">{{ t('paperl10n-source-pane', autonym(sourceLocale.id)) }}</th>
              <th scope="col">{{ t('paperl10n-target-pane', autonym(targetLocale.id)) }}</th>
              <th scope="col">
                <span class="visually-hidden">{{ t('paperl10n-column-status') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.before.value > 0" class="catalog-spacer" aria-hidden="true">
              <td colspan="4" :style="{ blockSize: `${rows.before.value}px` }"></td>
            </tr>
            <tr
              v-for="{ message, index } in rendered"
              :key="message.key"
              data-row
              :data-key="message.key"
              :data-open="message.key === editing.open.value ? '' : undefined"
              :aria-rowindex="index + 2"
              :data-status="message.status"
              @click="message.key === editing.open.value || openAt(index)"
            >
              <th scope="row" class="catalog-key">
                <button
                  type="button"
                  class="catalog-row-button"
                  :aria-expanded="message.key === editing.open.value"
                  @click.stop="toggle(index, message.key)"
                >
                  <bdi dir="ltr" class="catalog-clamp">{{ visibleKey(message.key) }}</bdi>
                </button>
                <span v-if="message.context !== null" class="catalog-context">
                  {{ t('paperl10n-message-context') }}
                  <bdi dir="auto">{{ message.context }}</bdi>
                </span>
              </th>
              <td :lang="sourceLocale.id" :dir="sourceLocale.direction">
                <dl
                  v-if="message.key === editing.open.value && message.sourceForms !== null"
                  class="catalog-source-forms"
                >
                  <div v-for="(form, at) in message.sourceForms" :key="at">
                    <dt :lang="uiLocale" :dir="uiDirection">
                      {{ sourceFormLabel(at, message.sourceForms.length) }}
                    </dt>
                    <dd><MessageText :text="form.text" :tokens="form.tokens" /></dd>
                  </div>
                </dl>
                <span v-else :class="{ 'catalog-clamp': message.key !== editing.open.value }">
                  <MessageText :text="message.source" :tokens="message.sourceTokens" />
                </span>
                <!-- What changed since the translation was made, when its file kept the source
                     it was made for (gettext's `#|`): removed and added words marked. -->
                <section
                  v-if="message.key === editing.open.value && message.needsReview"
                  class="catalog-review"
                >
                  <h3 :lang="uiLocale" :dir="uiDirection">
                    {{ t('paperl10n-message-needs-review') }}
                  </h3>
                  <p v-if="message.previousSource !== null" class="catalog-review-diff">
                    <template
                      v-for="(part, at) in diffWords(message.previousSource, message.source)"
                      :key="at"
                      ><del v-if="part.kind === 'removed'"
                        ><span class="visually-hidden" :lang="uiLocale">{{
                          t('paperl10n-message-removed-words')
                        }}</span
                        >{{ part.text }}</del
                      ><ins v-else-if="part.kind === 'added'"
                        ><span class="visually-hidden" :lang="uiLocale">{{
                          t('paperl10n-message-added-words')
                        }}</span
                        >{{ part.text }}</ins
                      ><template v-else>{{ part.text }}</template></template
                    >
                  </p>
                  <p v-else class="catalog-note" :lang="uiLocale" :dir="uiDirection">
                    {{ t('paperl10n-message-needs-review-note') }}
                  </p>
                </section>
                <!-- Documentation is about the source, in its direction; only its title and the
                     note that there's none are interface text. -->
                <section v-if="message.key === editing.open.value" class="catalog-documentation">
                  <h3 :lang="uiLocale" :dir="uiDirection">
                    {{ t('paperl10n-message-documentation') }}
                  </h3>
                  <p
                    v-if="message.documentation !== null"
                    class="catalog-documentation-text"
                    dir="auto"
                  >
                    {{ message.documentation }}
                  </p>
                  <p v-else class="catalog-note" :lang="uiLocale" :dir="uiDirection">
                    {{ t('paperl10n-message-no-documentation') }}
                  </p>
                </section>
              </td>
              <td :lang="targetLocale.id" :dir="targetLocale.direction">
                <template v-if="message.key === editing.open.value">
                  <div
                    v-for="(form, at) in editing.formsOf(message, formCount(message))"
                    :key="`${message.key}\n${String(at)}`"
                    class="catalog-form"
                  >
                    <span class="catalog-form-label" :lang="uiLocale" :dir="uiDirection">
                      {{ formLabel(at) }}
                    </span>
                    <MessageEditor
                      :ref="at === 0 ? setEditor : noRef"
                      :text="form"
                      :tokens="formTokens(message, at)"
                      :locale="targetLocale"
                      :label="
                        t(
                          'paperl10n-message-form-editor-label',
                          visibleKey(message.key),
                          formLabel(at),
                        )
                      "
                      :placeholder="t('paperl10n-message-editor-placeholder')"
                      @change="(text: string) => onEditForm(message, at, text)"
                      @next="move(1, false)"
                      @previous="move(-1, false)"
                      @next-needing-work="move(1, true)"
                      @previous-needing-work="move(-1, true)"
                      @close="close"
                    />
                    <ul
                      v-if="formWarnings(at).length > 0"
                      class="catalog-form-warnings"
                      :lang="uiLocale"
                      :dir="uiDirection"
                    >
                      <li v-for="(warning, w) in formWarnings(at)" :key="w">
                        {{ warningMessage(warning, t) }}
                      </li>
                    </ul>
                  </div>
                  <MessageEditor
                    v-if="formCount(message) === 0"
                    :key="message.key"
                    :ref="setEditor"
                    :text="editing.textOf(message)"
                    :tokens="startTokens(message)"
                    :locale="targetLocale"
                    :label="t('paperl10n-message-editor-label', visibleKey(message.key))"
                    :placeholder="t('paperl10n-message-editor-placeholder')"
                    @change="(text: string) => onEdit(message, text)"
                    @next="move(1, false)"
                    @previous="move(-1, false)"
                    @next-needing-work="move(1, true)"
                    @previous-needing-work="move(-1, true)"
                    @close="close"
                  />
                  <div class="catalog-open-footer" :lang="uiLocale" :dir="uiDirection">
                    <div v-if="warnings.length > 0" class="catalog-warnings">
                      <p class="catalog-note">{{ t('paperl10n-message-warnings') }}</p>
                      <ul>
                        <li v-for="(warning, at) in warnings" :key="at">
                          {{ warningMessage(warning, t) }}
                        </li>
                      </ul>
                    </div>
                    <MessagePreview
                      v-if="previewSource !== null"
                      :text="previewSource.text"
                      :tokens="previewSource.tokens"
                      :locale="targetLocale"
                    />
                    <div
                      v-if="message.status === 'outdated' && !editing.isEdited(message.key)"
                      class="catalog-keep"
                    >
                      <p class="catalog-note">{{ t('paperl10n-keep-up-to-date-note') }}</p>
                      <button type="button" class="pl-button" @click.stop="emit('keep', message)">
                        {{ t('paperl10n-keep-up-to-date') }}
                      </button>
                    </div>
                    <div class="catalog-moves">
                      <button
                        type="button"
                        class="pl-button"
                        aria-keyshortcuts="Alt+ArrowUp"
                        @click.stop="move(-1, false)"
                      >
                        {{ t('paperl10n-message-previous') }}
                      </button>
                      <button
                        type="button"
                        class="pl-button"
                        aria-keyshortcuts="Alt+ArrowDown"
                        @click.stop="move(1, false)"
                      >
                        {{ t('paperl10n-message-next') }}
                      </button>
                      <button
                        type="button"
                        class="pl-button"
                        aria-keyshortcuts="Alt+Shift+ArrowDown"
                        @click.stop="move(1, true)"
                      >
                        {{ t('paperl10n-message-next-needing-work') }}
                      </button>
                      <button
                        type="button"
                        class="pl-button"
                        aria-keyshortcuts="Escape"
                        @click.stop="close"
                      >
                        {{ t('paperl10n-message-close') }}
                      </button>
                    </div>
                    <p class="catalog-note" role="status">{{ moveNote ?? '' }}</p>
                    <p class="catalog-note">{{ keysHint }}</p>
                  </div>
                </template>
                <template v-else>
                  <span v-if="editing.shown(message) !== null" class="catalog-clamp">
                    <MessageText
                      :text="editing.shown(message)?.text ?? ''"
                      :tokens="editing.shown(message)?.tokens ?? []"
                    />
                  </span>
                  <span
                    v-if="editing.isEdited(message.key)"
                    class="catalog-edited"
                    :lang="uiLocale"
                    :dir="uiDirection"
                  >
                    {{ t('paperl10n-message-edited') }}
                  </span>
                </template>
              </td>
              <td class="catalog-status">
                <span class="pages-status" :data-status="message.status" aria-hidden="true"></span>
                <span class="visually-hidden">{{ t(statusNames[message.status]) }}</span>
              </td>
            </tr>
            <tr v-if="rows.after.value > 0" class="catalog-spacer" aria-hidden="true">
              <td colspan="4" :style="{ blockSize: `${rows.after.value}px` }"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="catalog-none">{{ t('paperl10n-no-matching-messages') }}</p>

      <section v-if="detail.notInSource.length > 0" class="catalog-orphans">
        <div class="catalog-orphans-heading">
          <h3>{{ t('paperl10n-not-in-source', detail.notInSource.length) }}</h3>
          <button
            v-if="detail.notInSource.some((message) => !editing.isEdited(message.key))"
            type="button"
            class="pl-button"
            @click="removeAll"
          >
            {{ t('paperl10n-remove-all-not-in-source') }}
          </button>
        </div>
        <p class="catalog-note">{{ t('paperl10n-not-in-source-note') }}</p>
        <ul>
          <li
            v-for="message in detail.notInSource"
            :key="message.key"
            :data-removed="editing.isEdited(message.key) ? '' : undefined"
          >
            <bdi dir="ltr" class="catalog-key">{{ message.key }}</bdi>
            <span :lang="targetLocale.id" :dir="targetLocale.direction" class="catalog-orphan-text">
              <MessageText :text="message.text" :tokens="message.tokens" />
            </span>
            <span v-if="editing.isEdited(message.key)" class="catalog-edited">
              {{ t('paperl10n-removed-not-saved') }}
            </span>
            <button
              type="button"
              class="pl-button"
              :aria-label="
                t(
                  editing.isEdited(message.key)
                    ? 'paperl10n-keep-message-label'
                    : 'paperl10n-remove-message-label',
                  message.key,
                )
              "
              @click="
                editing.isEdited(message.key)
                  ? editing.unremove(message.key)
                  : editing.remove(message.key, message.text)
              "
            >
              {{
                t(
                  editing.isEdited(message.key)
                    ? 'paperl10n-keep-message'
                    : 'paperl10n-remove-message',
                )
              }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </article>
</template>

<style scoped>
.catalog {
  --catalog-row-height: 4.5rem;

  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--pl-space-4);
  min-block-size: 0;
}

/* The list scrolls on its own, so only the rows in view need rendering: within the window's
   height when the app takes it (wide windows), else a fixed share of it. */
.catalog-scroll {
  block-size: 70vh;
  overflow-y: auto;
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
}

@media (min-width: 64rem) {
  .catalog-scroll {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 12rem;
  }
}

.catalog-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--pl-space-1) var(--pl-space-3);
  align-items: start;
}

.catalog-header > :not(.catalog-save) {
  grid-column: 1;
}

.catalog-save {
  display: flex;
  grid-row: 1 / span 2;
  grid-column: 2;
  align-items: center;
  gap: var(--pl-space-3);
}

.catalog-save-status {
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.catalog-keep {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-3);
}

.catalog-title {
  margin: 0;
  font-size: var(--pl-text-lg);
}

.catalog-paths,
.catalog-count,
.catalog-note,
.catalog-none {
  margin: 0;
  color: var(--pl-color-muted);
  font-size: var(--pl-text-sm);
}

.catalog-error,
.catalog-warning {
  margin: 0;
  padding: var(--pl-space-3);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-danger-surface);
  color: var(--pl-color-danger);
}

.catalog-error p {
  margin: 0;
}

.catalog-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-3);
}

.catalog-search {
  display: flex;
  flex: 1 1 16rem;
  align-items: center;
  gap: var(--pl-space-2);
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-3);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  color: var(--pl-color-muted);
}

.catalog-search:focus-within {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 1px;
}

.catalog-search input {
  flex: 1 1 auto;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  color: var(--pl-color-ink);
  outline: none;
}

.catalog-filter {
  display: flex;
  align-items: center;
  gap: var(--pl-space-2);
  font-size: var(--pl-text-sm);
}

.catalog-filter select {
  min-block-size: var(--pl-control-height);
  padding-inline: var(--pl-space-2);
  border: 1px solid var(--pl-color-line);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-surface);
  color: var(--pl-color-ink);
}

.catalog-messages {
  inline-size: 100%;
  border-collapse: collapse;
  background: var(--pl-color-surface);
  font-family: var(--pl-font-text);
}

.catalog-messages th,
.catalog-messages td {
  padding-block: var(--pl-space-2);
  padding-inline: var(--pl-space-3);
  border-block-end: 1px solid var(--pl-color-line);
  text-align: start;
  vertical-align: top;
}

.catalog-messages thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--pl-color-surface);
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.catalog-messages tr[data-row] {
  block-size: var(--catalog-row-height);
  cursor: pointer;
}

/* The open row: as tall as it needs, and not a button anymore. */
.catalog-messages tr[data-open] {
  block-size: auto;
  background: var(--pl-color-bar);
  cursor: auto;
}

.catalog-row-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.catalog-row-button:focus-visible {
  outline: 2px solid var(--pl-color-focus);
  outline-offset: 2px;
}

.catalog-documentation {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
  margin-block-start: var(--pl-space-3);
  padding: var(--pl-space-3);
  border-inline-start: 3px solid var(--pl-color-accent);
  border-radius: var(--pl-radius-sm);
  background: var(--pl-color-code-surface);
}

.catalog-documentation h3 {
  margin: 0;
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

/* A message's context (gettext's msgctxt), under its key. */
.catalog-context {
  display: block;
  margin-block-start: var(--pl-space-1);
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
}

/* The source's plural forms, and the translation's fields, each with its label. */
.catalog-source-forms {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--pl-space-1) var(--pl-space-3);
  margin: 0;
}

.catalog-source-forms > div {
  display: contents;
}

.catalog-source-forms dt,
.catalog-form-label {
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
}

.catalog-source-forms dd {
  margin: 0;
}

.catalog-form {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
}

.catalog-form + .catalog-form {
  margin-block-start: var(--pl-space-3);
}

.catalog-form-warnings {
  margin: 0;
  padding-inline-start: var(--pl-space-4);
  border-inline-start: 3px solid var(--pl-color-warn);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
}

/* A translation its file marks as needing review, with what changed in the source since. */
.catalog-review {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-1);
  margin-block-start: var(--pl-space-3);
  padding: var(--pl-space-3);
  border-inline-start: 3px solid var(--pl-color-warn);
  border-radius: var(--pl-radius-sm);
  background: var(--pl-color-warn-surface);
}

.catalog-review h3 {
  margin: 0;
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
  font-weight: 600;
}

.catalog-review-diff {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.catalog-review-diff del {
  color: var(--pl-color-danger);
}

/* A word replaced: the old and the new apart, not run together. */
.catalog-review-diff del + ins {
  margin-inline-start: 0.3em;
}

.catalog-review-diff ins {
  background: var(--pl-color-surface);
  color: var(--pl-color-ok);
  text-decoration-thickness: 2px;
}

.catalog-documentation-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.catalog-open-footer {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  margin-block-start: var(--pl-space-2);
  font-family: var(--pl-font-ui);
}

.catalog-warnings {
  padding-inline-start: var(--pl-space-3);
  border-inline-start: 3px solid var(--pl-color-warn);
}

.catalog-warnings ul {
  margin: var(--pl-space-1) 0 0;
  padding-inline-start: var(--pl-space-4);
  color: var(--pl-color-ink);
  font-size: var(--pl-text-sm);
}

.catalog-moves {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-2);
}

.catalog-edited {
  display: block;
  margin-block-start: var(--pl-space-1);
  color: var(--pl-color-muted);
  font-family: var(--pl-font-ui);
  font-size: var(--pl-text-sm);
  font-style: italic;
}

.catalog-spacer td {
  padding: 0;
  border: 0;
}

/* Two lines at most, so every row is the same height; a row opened for editing shows it all. */
.catalog-clamp {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.catalog-key {
  font-family: var(--pl-font-mono);
  font-size: var(--pl-text-sm);
  font-weight: 400;
  overflow-wrap: anywhere;
}

.catalog-status {
  inline-size: 1.5rem;
}

/* The status's shape (base.css) is sized: a block of its own here, not inline text. */
.catalog-status .pages-status {
  display: block;
  margin-block-start: 0.4em;
}

.catalog-orphans {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
}

.catalog-orphans-heading,
.catalog-restored {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pl-space-2) var(--pl-space-3);
}

.catalog-orphans li {
  align-items: center;
}

.catalog-orphans li[data-removed] .catalog-orphan-text {
  color: var(--pl-color-muted);
  text-decoration: line-through;
}

.catalog-orphans h3 {
  margin: 0;
  font-size: var(--pl-text-md);
}

.catalog-orphans ul {
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.catalog-orphans li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pl-space-3);
}
</style>
