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

  return { summary, documents, error, busy, open };
}
