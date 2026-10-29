// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { EditorSnapshot } from '../editor/markdown-editor';

/** What the translation pane says about saving. */
export type SaveStatus = 'clean' | 'unsaved' | 'saving' | 'saved';

export interface TranslationSaving {
  /** A new translation was started from a copy of the source (not a file until saved). */
  readonly started: Ref<boolean>;
  /** The page opened with a draft from an earlier session: the editor shows its text. */
  readonly restored: Ref<boolean>;
  /** Say that a draft was restored (until it's saved or discarded). */
  readonly restoredNotice: Ref<boolean>;
  /** The editor's text differs from the file (or there's no file yet). */
  readonly dirty: Ref<boolean>;
  /** The translation has no file yet (saving creates it). */
  readonly isNew: ComputedRef<boolean>;
  readonly status: ComputedRef<SaveStatus>;
  readonly error: ShallowRef<ErrorDto | null>;
  /** Keeping the draft failed (the edits are still in the editor). */
  readonly draftError: ShallowRef<ErrorDto | null>;
  /** Starts a new translation for a page that has none. */
  start(): void;
  /** The editor reports whether it has unsaved changes. */
  setDirty(dirty: boolean): void;
  /** The editor's text changed: keep it as a draft once typing pauses. */
  noteEdit(): void;
  /** Saves the snapshot; true when it was saved. Failures stay in `error`. */
  save(snapshot: EditorSnapshot): Promise<boolean>;
  /** Drops the unsaved edits' draft (leaving without saving). */
  discardDraft(): Promise<void>;
  /** Drops a restored draft: the editor goes back to the file. */
  discardRestored(): Promise<void>;
}

export interface TranslationSavingOptions {
  /** The open page's editor text, when there's an editor. */
  readonly currentSnapshot: () => EditorSnapshot | null;
  /** A page gained or lost its draft (for the page list). */
  readonly onDraftChange: (key: string, hasDraft: boolean) => void;
  /** A page was saved: its file exists, and main forgot its draft. */
  readonly onSaved: (key: string) => void;
  /** How long typing must pause before the draft is kept, in milliseconds. */
  readonly draftDelay?: number;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * Saving the open page's translation, and keeping its unsaved edits as a draft (in the app's data,
 * via main) so a crash or a restart doesn't lose them. The save sends the text the editing started
 * from (`base`: the file as read, the last save, or a restored draft's base; `null` for a new
 * translation), so main refuses to overwrite a file that changed on disk meanwhile. A new page (or
 * the same page read again) starts over.
 */
export function useTranslationSaving(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  pair: Readonly<Ref<DocumentPairDto | null>>,
  options: TranslationSavingOptions,
): TranslationSaving {
  const started = ref(false);
  const restored = ref(false);
  const restoredNotice = ref(false);
  const dirty = ref(false);
  const saving = ref(false);
  const savedOnce = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  const draftError = shallowRef<ErrorDto | null>(null);
  const base = ref<string | null>(null);
  // Whether main may hold a draft for this page (restored, or kept since).
  let kept = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelDraft = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  watch(
    pair,
    (current) => {
      cancelDraft();
      const draft = current?.draft ?? null;
      started.value = false;
      restored.value = draft !== null;
      restoredNotice.value = draft !== null;
      kept = draft !== null;
      dirty.value = false;
      saving.value = false;
      savedOnce.value = false;
      error.value = null;
      draftError.value = null;
      base.value = draft === null ? (current?.target?.text ?? null) : draft.base;
    },
    { immediate: true },
  );

  const status = computed<SaveStatus>(() => {
    if (saving.value) return 'saving';
    if (dirty.value) return 'unsaved';
    return savedOnce.value ? 'saved' : 'clean';
  });

  /** Keeps the editor's text as the page's draft, or forgets the draft when nothing's unsaved. */
  async function keepDraft(): Promise<void> {
    const project = projectId.value;
    const current = pair.value;
    if (project === null || current === null) return;
    try {
      if (dirty.value) {
        const snapshot = options.currentSnapshot();
        if (snapshot === null) return;
        const request = { projectId: project, key: current.key, text: snapshot.text };
        const result = await client.saveDraft({ ...request, base: base.value });
        if (pair.value !== current) return;
        draftError.value = result.ok ? null : result.error;
        if (result.ok && !kept) options.onDraftChange(current.key, true);
        kept ||= result.ok;
      } else if (kept) {
        const result = await client.discardDraft({ projectId: project, key: current.key });
        if (pair.value !== current || !result.ok) return;
        kept = false;
        options.onDraftChange(current.key, false);
      }
    } catch {
      if (pair.value === current) draftError.value = transportFailed;
    }
  }

  async function discardDraft(): Promise<void> {
    cancelDraft();
    const project = projectId.value;
    const current = pair.value;
    if (project === null || current === null || !kept) return;
    try {
      const result = await client.discardDraft({ projectId: project, key: current.key });
      if (!result.ok) return;
    } catch {
      return;
    }
    kept = false;
    options.onDraftChange(current.key, false);
  }

  async function save(snapshot: EditorSnapshot): Promise<boolean> {
    const project = projectId.value;
    const current = pair.value;
    if (project === null || current === null || saving.value) return false;
    saving.value = true;
    error.value = null;
    try {
      const result = await client.saveDocument({
        projectId: project,
        key: current.key,
        text: snapshot.text,
        base: base.value,
      });
      // Another page (or a reload) since: that page's state isn't ours to change.
      if (pair.value !== current) return result.ok;
      if (!result.ok) {
        error.value = result.error;
        return false;
      }
      // Main forgot the draft with the save. A pending draft still runs: it keeps text typed during
      // the save (still unsaved), and does nothing if everything is saved.
      kept = false;
      restoredNotice.value = false;
      draftError.value = null;
      base.value = snapshot.text;
      savedOnce.value = true;
      snapshot.markSaved();
      options.onSaved(current.key);
      return true;
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      if (pair.value === current) error.value = transportFailed;
      return false;
    } finally {
      if (pair.value === current) saving.value = false;
    }
  }

  return {
    started,
    restored,
    restoredNotice,
    dirty,
    isNew: computed(() => base.value === null),
    status,
    error,
    draftError,
    start: () => {
      started.value = true;
    },
    setDirty: (value) => {
      dirty.value = value;
      if (value) savedOnce.value = false;
    },
    noteEdit: () => {
      cancelDraft();
      timer = setTimeout(() => void keepDraft(), options.draftDelay ?? 800);
    },
    save,
    discardDraft,
    discardRestored: async () => {
      const current = pair.value;
      await discardDraft();
      if (pair.value !== current || kept) return;
      restored.value = false;
      restoredNotice.value = false;
      dirty.value = false;
      base.value = current?.target?.text ?? null;
    },
  };
}
