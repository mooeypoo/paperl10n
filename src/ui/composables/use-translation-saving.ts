// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { EditorSnapshot } from '../editor/markdown-editor';

/** What the translation pane says about saving. */
export type SaveStatus = 'clean' | 'unsaved' | 'saving' | 'saved';

export interface TranslationSaving {
  /** A new translation was started from a copy of the source (not a file until saved). */
  readonly started: Ref<boolean>;
  /** The editor's text differs from the file (or there's no file yet). */
  readonly dirty: Ref<boolean>;
  /** The translation has no file yet (saving creates it). */
  readonly isNew: ComputedRef<boolean>;
  readonly status: ComputedRef<SaveStatus>;
  readonly error: ShallowRef<ErrorDto | null>;
  /** Starts a new translation for a page that has none. */
  start(): void;
  /** The editor reports whether it has unsaved changes. */
  setDirty(dirty: boolean): void;
  /** Saves the snapshot; true when it was saved. Failures stay in `error`. */
  save(snapshot: EditorSnapshot): Promise<boolean>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/**
 * Saving the open page's translation. The save sends the text the editing started from (`base`:
 * the file as read, or the last save; `null` for a new translation), so main refuses to overwrite
 * a file that changed on disk meanwhile. A new page (or the same page read again) starts over.
 */
export function useTranslationSaving(
  client: PaperLionApi,
  projectId: Readonly<Ref<string | null>>,
  pair: Readonly<Ref<DocumentPairDto | null>>,
  onSaved: (key: string) => void,
): TranslationSaving {
  const started = ref(false);
  const dirty = ref(false);
  const saving = ref(false);
  const savedOnce = ref(false);
  const error = shallowRef<ErrorDto | null>(null);
  const base = ref<string | null>(null);

  watch(
    pair,
    (current) => {
      started.value = false;
      dirty.value = false;
      saving.value = false;
      savedOnce.value = false;
      error.value = null;
      base.value = current?.target?.text ?? null;
    },
    { immediate: true },
  );

  const status = computed<SaveStatus>(() => {
    if (saving.value) return 'saving';
    if (dirty.value) return 'unsaved';
    return savedOnce.value ? 'saved' : 'clean';
  });

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
      base.value = snapshot.text;
      savedOnce.value = true;
      snapshot.markSaved();
      onSaved(current.key);
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
    dirty,
    isNew: computed(() => base.value === null),
    status,
    error,
    start: () => {
      started.value = true;
    },
    setDirty: (value) => {
      dirty.value = value;
      if (value) savedOnce.value = false;
    },
    save,
  };
}
