<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script setup lang="ts">
import type { ErrorDto } from '#ipc-contract';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useClient } from './client';
import AppHeader from './components/AppHeader.vue';
import ConflictDialog from './components/ConflictDialog.vue';
import DocumentView from './components/DocumentView.vue';
import LanguagePicker from './components/LanguagePicker.vue';
import PagesSidebar from './components/PagesSidebar.vue';
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue';
import WelcomeState from './components/WelcomeState.vue';
import { useDocumentPair } from './composables/use-document-pair';
import { usePages } from './composables/use-pages';
import { useProject } from './composables/use-project';
import { useTranslationSaving } from './composables/use-translation-saving';
import { useTranslationStatus } from './composables/use-translation-status';
import { useEnvironment } from './environment';
import { errorMessage } from './i18n/error-message';
import { useI18n } from './i18n/i18n';
import { rememberRecentLanguage } from './preferences';

const { t } = useI18n();
const client = useClient();
const project = useProject(client);
const { summary, documents, statusFile, error, busy } = project;
const projectId = computed(() => summary.value?.projectId ?? null);
const { query, matches, selectedKey, selected } = usePages(documents, projectId);
const reading = useDocumentPair(client, projectId, selectedKey);
const { pair, loading } = reading;
const readError = reading.error;
const errorText = computed(() => (error.value === null ? '' : errorMessage(error.value, t)));
const translationStatus = useTranslationStatus(client, projectId, pair, (key, status) => {
  project.setStatus(key, status.page);
});

const documentView = useTemplateRef<InstanceType<typeof DocumentView>>('documentView');
const saving = useTranslationSaving(client, projectId, pair, {
  currentSnapshot: () => documentView.value?.snapshot() ?? null,
  onDraftChange: (key, hasDraft) => {
    project.markDraft(key, hasDraft);
  },
  onSaved: (key) => {
    project.markTranslated(key);
    translationStatus.noteSaved(key);
  },
});
const { started, restored, restoredNotice, dirty, isNew, status: saveStatus } = saving;
const saveError = saving.error;
const draftError = saving.draftError;
const conflict = saving.conflict;

/** Saves the open page's translation; true when there's nothing left unsaved. */
async function saveCurrent(): Promise<boolean> {
  if (!dirty.value) return true;
  const snapshot = documentView.value?.snapshot() ?? null;
  return snapshot === null ? false : saving.save(snapshot);
}

// Leaving a page with unsaved changes (another page, another project, another language, closing
// the window) asks first: save, don't save, or stay.
const pendingLeave = shallowRef<(() => void) | null>(null);
const leavingKey = ref('');

function guard(leave: () => void): void {
  // While the conflict question is open, it's answered first; leaving waits.
  if (conflict.value) return;
  if (!dirty.value) {
    leave();
    return;
  }
  leavingKey.value = selectedKey.value ?? '';
  pendingLeave.value = leave;
}

async function resolveLeave(choice: 'save' | 'discard' | 'cancel'): Promise<void> {
  const leave = pendingLeave.value;
  if (leave === null) return;
  // A failed save keeps the page open, with the error showing.
  if (choice === 'save' && !(await saveCurrent())) {
    pendingLeave.value = null;
    return;
  }
  pendingLeave.value = null;
  if (choice === 'cancel') return;
  // Leaving without saving drops the edits, and their draft.
  if (choice === 'discard') await saving.discardDraft();
  leave();
}

// Saving found the file changed on disk: keep editing, reload it (dropping the edits and their
// draft), or overwrite it with the edits.
async function resolveConflict(choice: 'reload' | 'overwrite' | 'keep'): Promise<void> {
  if (choice === 'keep') {
    saving.keepEditing();
  } else if (choice === 'reload') {
    saving.keepEditing();
    await saving.discardDraft();
    reading.reload();
  } else {
    const snapshot = documentView.value?.snapshot() ?? null;
    if (snapshot === null) saving.keepEditing();
    else await saving.overwrite(snapshot);
  }
}

function open(): void {
  guard(() => void project.open());
}

function selectPage(key: string): void {
  if (key !== selectedKey.value) guard(() => (selectedKey.value = key));
}

// Ctrl+S (Cmd+S on macOS) saves, wherever the focus is. `code` matches the key's place, so it
// works with any keyboard layout (on a Hebrew layout, `key` is "ד").
function onKeydown(event: KeyboardEvent): void {
  const save = event.code === 'KeyS' || event.key.toLowerCase() === 's';
  if (!save || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  event.preventDefault();
  if (pendingLeave.value === null && !conflict.value) void saveCurrent();
}

// Closing the window: cancel it, ask, and close for real once the user decides.
let closing = false;
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (closing || !dirty.value) return;
  event.preventDefault();
  guard(() => {
    closing = true;
    window.close();
  });
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

// Marking every existing translation up to date: offered once, while the language has no status
// file (nothing was ever marked), until it's done or put off for this project.
const existingPutOff = ref(false);
const markingExisting = ref(false);
const markExistingError = shallowRef<ErrorDto | null>(null);
const markedExisting = ref<number | null>(null);
watch(projectId, () => {
  existingPutOff.value = false;
  markExistingError.value = null;
  markedExisting.value = null;
});
const offerExisting = computed(
  () => !existingPutOff.value && !statusFile.value.exists && statusFile.value.problem === null,
);
async function markExisting(): Promise<void> {
  markingExisting.value = true;
  markExistingError.value = null;
  const result = await project.markExisting();
  markingExisting.value = false;
  if ('error' in result) {
    markExistingError.value = result.error;
    return;
  }
  markedExisting.value = result.marked.length;
  translationStatus.noteMarked(result.marked);
}
const statusProblemText = computed(() => {
  const problem = statusFile.value.problem;
  return problem === null ? '' : errorMessage(problem, t);
});

const { preferences } = useEnvironment();
const pickerOpen = ref(false);
const chooseError = shallowRef<ErrorDto | null>(null);

function openPicker(): void {
  chooseError.value = null;
  pickerOpen.value = true;
}

// A project opened without a target language asks for one right away.
watch(summary, (opened, previous) => {
  if (opened !== null && opened.targetLocale === null && opened.projectId !== previous?.projectId)
    openPicker();
});

async function chooseTarget(tag: string): Promise<void> {
  chooseError.value = null;
  const failure = await project.chooseTarget(tag);
  if (failure !== null) {
    chooseError.value = failure;
    return;
  }
  const chosen = summary.value?.targetLocale ?? null;
  if (chosen !== null) rememberRecentLanguage(preferences, chosen.id);
  pickerOpen.value = false;
}
</script>

<template>
  <div class="app">
    <AppHeader :summary="summary" :busy="busy" @open="open" @choose-language="guard(openPicker)" />
    <UnsavedChangesDialog
      :open="pendingLeave !== null"
      :page-key="leavingKey"
      :busy="saveStatus === 'saving'"
      @save="resolveLeave('save')"
      @discard="resolveLeave('discard')"
      @cancel="resolveLeave('cancel')"
    />
    <ConflictDialog
      :open="conflict"
      :path="selected?.targetPath ?? ''"
      :busy="saveStatus === 'saving'"
      @reload="resolveConflict('reload')"
      @overwrite="resolveConflict('overwrite')"
      @keep-editing="resolveConflict('keep')"
    />
    <LanguagePicker
      :open="pickerOpen"
      :project-id="projectId"
      :current="summary?.targetLocale ?? null"
      :busy="busy"
      :choose-error="chooseError"
      @close="pickerOpen = false"
      @choose="chooseTarget"
    />

    <div v-if="summary !== null" class="app-body">
      <PagesSidebar
        v-model:query="query"
        class="app-sidebar"
        :documents="documents"
        :matches="matches"
        :selected-key="selectedKey"
        :unsaved-key="dirty ? selectedKey : null"
        :offer-existing="offerExisting"
        :marking-existing="markingExisting"
        :mark-existing-error="markExistingError"
        :marked-existing="markedExisting"
        @select="selectPage"
        @mark-existing="markExisting"
        @dismiss-existing="existingPutOff = true"
      />
      <main class="app-main">
        <div v-if="error !== null" class="app-error" role="alert">
          <p>{{ errorText }}</p>
          <ul v-if="error.details.length > 0">
            <li v-for="detail in error.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
          </ul>
        </div>
        <div v-if="statusFile.problem !== null" class="app-warnings" role="alert">
          <p>{{ statusProblemText }}</p>
          <ul v-if="statusFile.problem.details.length > 0">
            <li v-for="detail in statusFile.problem.details" :key="detail" lang="en" dir="ltr">
              {{ detail }}
            </li>
          </ul>
        </div>
        <div v-if="summary.warnings.length > 0" class="app-warnings">
          <p>{{ t('paperl10n-config-warnings') }}</p>
          <ul>
            <li v-for="warning in summary.warnings" :key="warning" lang="en" dir="ltr">
              {{ warning }}
            </li>
          </ul>
        </div>
        <div v-if="summary.targetLocale === null" class="app-notice">
          <p>{{ t('paperl10n-needs-target') }}</p>
          <button type="button" class="pl-button" data-variant="primary" @click="openPicker">
            {{ t('paperl10n-choose-target') }}
          </button>
        </div>
        <DocumentView
          v-else-if="selected !== null"
          ref="documentView"
          :source-locale="summary.sourceLocale"
          :target-locale="summary.targetLocale"
          :document="selected"
          :pair="pair"
          :loading="loading"
          :error="readError"
          :started="started"
          :restored="restored"
          :restored-notice="restoredNotice"
          :draft-error="draftError"
          :is-new="isNew"
          :save-status="saveStatus"
          :save-error="saveError"
          :status="translationStatus.status.value"
          :marking="translationStatus.marking.value"
          :mark-error="translationStatus.error.value"
          @start="saving.start()"
          @dirty="saving.setDirty"
          @change="saving.noteEdit()"
          @save="saveCurrent"
          @discard-restored="saving.discardRestored()"
          @mark-page="translationStatus.markPage()"
          @reopen="guard(() => reading.reload())"
        />
        <p v-else class="app-empty">{{ t('paperl10n-no-documents') }}</p>
      </main>
    </div>

    <main v-else class="app-main">
      <div v-if="error !== null" class="app-error" role="alert">
        <p>{{ errorText }}</p>
        <ul v-if="error.details.length > 0">
          <li v-for="detail in error.details" :key="detail" lang="en" dir="ltr">{{ detail }}</li>
        </ul>
      </div>
      <WelcomeState :busy="busy" @open="open" />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
}

.app-body {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  min-block-size: 0;
}

.app-sidebar {
  flex: 1 1 15rem;
  max-inline-size: 18rem;
}

.app-main {
  flex: 999 1 36rem;
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--pl-space-4);
  padding: var(--pl-space-5);
}

.app-error,
.app-warnings {
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
}

.app-error {
  border: 1px solid var(--pl-color-danger);
  background: var(--pl-color-danger-surface);
}

.app-warnings {
  background: var(--pl-color-chip);
}

.app-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pl-space-3);
  margin: 0;
  padding: var(--pl-space-3) var(--pl-space-4);
  border-radius: var(--pl-radius-md);
  background: var(--pl-color-chip);
}

.app-error p,
.app-error ul,
.app-warnings p,
.app-warnings ul {
  margin: 0;
}

.app-empty {
  margin: 0;
  color: var(--pl-color-muted);
}
</style>
