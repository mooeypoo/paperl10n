// SPDX-License-Identifier: GPL-3.0-or-later
import type { ErrorDto, PaperLionApi, ProjectSummaryDto, SourceDocumentDto } from '#ipc-contract';
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';

export interface ProjectState {
  readonly summary: ShallowRef<ProjectSummaryDto | null>;
  readonly documents: ShallowRef<readonly SourceDocumentDto[]>;
  readonly error: ShallowRef<ErrorDto | null>;
  readonly busy: Ref<boolean>;
  /** Asks for a folder and opens it. Cancelling the dialog leaves everything as it was. */
  open(): Promise<void>;
  /**
   * Makes a language the project's target (saved to its config), then lists the pages again.
   * Returns the error when it fails; the project stays as it was.
   */
  chooseTarget(language: string): Promise<ErrorDto | null>;
  /** A page's translation was saved: its file exists now, and it has no draft. */
  markTranslated(key: string): void;
  /** A page gained or lost its draft. */
  markDraft(key: string, hasDraft: boolean): void;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/** The open project, its documents, and the last error. Only the newest request may update them. */
export function useProject(client: PaperLionApi): ProjectState {
  const summary = shallowRef<ProjectSummaryDto | null>(null);
  const documents = shallowRef<readonly SourceDocumentDto[]>([]);
  const error = shallowRef<ErrorDto | null>(null);
  const busy = ref(false);
  let latest = 0;

  async function open(): Promise<void> {
    const request = ++latest;
    busy.value = true;
    try {
      const opened = await client.openProject();
      if (request !== latest) return;
      if (!opened.ok) {
        error.value = opened.error;
        return;
      }
      if (opened.value === null) return;
      if (opened.value.targetLocale === null) {
        // Nothing to pair yet: the UI asks for a target language first.
        error.value = null;
        summary.value = opened.value;
        documents.value = [];
        return;
      }
      const listed = await client.listSourceDocuments({ projectId: opened.value.projectId });
      if (request !== latest) return;
      if (!listed.ok) {
        error.value = listed.error;
        return;
      }
      error.value = null;
      summary.value = opened.value;
      documents.value = listed.value;
    } catch {
      // The app's API never rejects (ADR 0007); a rejection means the transport itself broke.
      if (request === latest) error.value = transportFailed;
    } finally {
      if (request === latest) busy.value = false;
    }
  }

  async function chooseTarget(language: string): Promise<ErrorDto | null> {
    const current = summary.value;
    if (current === null) return null;
    const request = ++latest;
    busy.value = true;
    try {
      const chosen = await client.chooseTargetLocale({ projectId: current.projectId, language });
      if (!chosen.ok) return chosen.error;
      const listed = await client.listSourceDocuments({ projectId: current.projectId });
      if (request !== latest) return null;
      summary.value = { ...current, targetLocale: chosen.value };
      if (listed.ok) {
        error.value = null;
        documents.value = listed.value;
      } else {
        error.value = listed.error;
        documents.value = [];
      }
      return null;
    } catch {
      return transportFailed;
    } finally {
      if (request === latest) busy.value = false;
    }
  }

  /** Changes one page's entry; the list stays the same object when nothing changes. */
  function update(key: string, change: Partial<SourceDocumentDto>): void {
    const entry = documents.value.find((document) => document.key === key);
    if (entry === undefined) return;
    const changed = { ...entry, ...change };
    if (changed.targetExists === entry.targetExists && changed.hasDraft === entry.hasDraft) return;
    documents.value = documents.value.map((document) => (document === entry ? changed : document));
  }

  return {
    summary,
    documents,
    error,
    busy,
    open,
    chooseTarget,
    markTranslated: (key) => {
      update(key, { targetExists: true, hasDraft: false });
    },
    markDraft: (key, hasDraft) => {
      update(key, { hasDraft });
    },
  };
}
