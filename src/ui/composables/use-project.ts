// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  CatalogDto,
  ErrorDto,
  PageStatusDto,
  PaperLionApi,
  ProjectSummaryDto,
  SourceDocumentDto,
  SourceDocumentListDto,
} from '#ipc-contract';
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';

export interface ProjectState {
  readonly summary: ShallowRef<ProjectSummaryDto | null>;
  readonly documents: ShallowRef<readonly SourceDocumentDto[]>;
  /** The project's message catalogs; `null` when it has no catalog format. */
  readonly catalogs: ShallowRef<readonly CatalogDto[] | null>;
  /** The target language's status file, as last listed. */
  readonly statusFile: ShallowRef<SourceDocumentListDto['statusFile']>;
  readonly error: ShallowRef<ErrorDto | null>;
  readonly busy: Ref<boolean>;
  /** Asks for a folder and opens it. Cancelling the dialog leaves everything as it was. */
  open(): Promise<void>;
  /**
   * Makes a language the project's target (saved to its config), then lists the pages again.
   * Returns the error when it fails; the project stays as it was.
   */
  chooseTarget(language: string): Promise<ErrorDto | null>;
  /** A page's translation was saved: its file exists now (a new one is a draft), and it has no draft. */
  markTranslated(key: string): void;
  /** A page gained or lost its draft. */
  markDraft(key: string, hasDraft: boolean): void;
  /** A page was marked up to date (so the status file exists now): its status after. */
  setStatus(key: string, status: PageStatusDto): void;
  /**
   * Marks every existing translation never marked up to date (the one-time start), then lists the
   * pages again. Returns the keys it marked, or the error.
   */
  markExisting(): Promise<{ readonly marked: readonly string[] } | { readonly error: ErrorDto }>;
}

const noStatusFile: SourceDocumentListDto['statusFile'] = { exists: false, problem: null };
const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

/** The open project, its documents, and the last error. Only the newest request may update them. */
export function useProject(client: PaperLionApi): ProjectState {
  const summary = shallowRef<ProjectSummaryDto | null>(null);
  const documents = shallowRef<readonly SourceDocumentDto[]>([]);
  const catalogs = shallowRef<readonly CatalogDto[] | null>(null);
  const statusFile = shallowRef<SourceDocumentListDto['statusFile']>(noStatusFile);
  const error = shallowRef<ErrorDto | null>(null);
  const busy = ref(false);
  let latest = 0;

  /** The project's catalogs, when it has a catalog format: no request otherwise. */
  async function listCatalogs(
    project: ProjectSummaryDto,
  ): Promise<
    | { readonly ok: true; readonly value: readonly CatalogDto[] | null }
    | { readonly ok: false; readonly error: ErrorDto }
  > {
    if (project.catalogFormat === null) return { ok: true, value: null };
    const listed = await client.listCatalogs({ projectId: project.projectId });
    return listed.ok ? { ok: true, value: listed.value.catalogs } : listed;
  }

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
        catalogs.value = opened.value.catalogFormat === null ? null : [];
        statusFile.value = noStatusFile;
        return;
      }
      const listed = await client.listSourceDocuments({ projectId: opened.value.projectId });
      if (request !== latest) return;
      if (!listed.ok) {
        error.value = listed.error;
        return;
      }
      const listedCatalogs = await listCatalogs(opened.value);
      if (request !== latest) return;
      if (!listedCatalogs.ok) {
        error.value = listedCatalogs.error;
        return;
      }
      error.value = null;
      summary.value = opened.value;
      documents.value = listed.value.documents;
      catalogs.value = listedCatalogs.value;
      statusFile.value = listed.value.statusFile;
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
      const listedCatalogs = await listCatalogs(current);
      if (request !== latest) return null;
      summary.value = { ...current, targetLocale: chosen.value };
      // The target is chosen either way; a listing that fails shows its error over empty lists.
      const failed = (listError: ErrorDto) => {
        error.value = listError;
        documents.value = [];
        catalogs.value = current.catalogFormat === null ? null : [];
        statusFile.value = noStatusFile;
        return null;
      };
      if (!listed.ok) return failed(listed.error);
      if (!listedCatalogs.ok) return failed(listedCatalogs.error);
      error.value = null;
      documents.value = listed.value.documents;
      catalogs.value = listedCatalogs.value;
      statusFile.value = listed.value.statusFile;
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
    if (
      changed.targetExists === entry.targetExists &&
      changed.hasDraft === entry.hasDraft &&
      changed.status === entry.status
    ) {
      return;
    }
    documents.value = documents.value.map((document) => (document === entry ? changed : document));
  }

  async function markExisting(): Promise<
    { readonly marked: readonly string[] } | { readonly error: ErrorDto }
  > {
    const current = summary.value;
    if (current === null) return { marked: [] };
    const request = ++latest;
    busy.value = true;
    try {
      const marked = await client.markExistingUpToDate({ projectId: current.projectId });
      if (!marked.ok) return { error: marked.error };
      const listed = await client.listSourceDocuments({ projectId: current.projectId });
      if (request === latest && listed.ok) {
        documents.value = listed.value.documents;
        statusFile.value = listed.value.statusFile;
      }
      return { marked: marked.value.marked };
    } catch {
      return { error: transportFailed };
    } finally {
      if (request === latest) busy.value = false;
    }
  }

  return {
    summary,
    documents,
    catalogs,
    statusFile,
    error,
    busy,
    open,
    chooseTarget,
    markTranslated: (key) => {
      const entry = documents.value.find((document) => document.key === key);
      update(key, {
        targetExists: true,
        hasDraft: false,
        status: entry === undefined || entry.status === 'missing' ? 'draft' : entry.status,
      });
    },
    markDraft: (key, hasDraft) => {
      update(key, { hasDraft });
    },
    setStatus: (key, status) => {
      update(key, { status });
      if (!statusFile.value.exists) statusFile.value = { ...statusFile.value, exists: true };
    },
    markExisting,
  };
}
