// SPDX-License-Identifier: GPL-3.0-or-later
// The app's wiring, shared by every composition root: Electron (src/app/node/, step 13) and the
// browser UI harness (src/ui-harness/, step 14, a testing aid). Roots differ only in the ports they pass in.
import type { MarkdownParser } from '#domains/document';
import { createFormatRegistry, type PluginModule, type RegistryError } from '#domains/formats';
import {
  createCheckTranslation,
  createChooseTargetLocale,
  createDiscardDraft,
  createListCatalogs,
  createReadCatalog,
  createListSourceDocuments,
  createMarkExistingUpToDate,
  createMarkUpToDate,
  createOpenProject,
  createReadDocumentPair,
  createSaveDocument,
  createSaveDraft,
  createSearchTargetLanguages,
  createStatusUpdates,
  createSuggestTargetLanguages,
  type DraftStore,
  type FolderPicker,
  type ProjectFilesOpener,
  type ProjectSessions,
} from '#domains/workspace';
import type { PaperLionApi } from '#ipc-contract';
import { ok, type Result } from '#kernel/result';
import { createApiHandlers } from './api-handlers.ts';
import { guardApi, type OnUnexpected } from './guard-api.ts';

export interface AppDependencies {
  readonly folderPicker: FolderPicker;
  readonly opener: ProjectFilesOpener;
  readonly sessions: ProjectSessions;
  /** Where unsaved edits are kept: the app's data folder (Electron), or memory (the harness). */
  readonly drafts: DraftStore;
  readonly parser: MarkdownParser;
  readonly plugins: readonly PluginModule[];
  readonly onUnexpected: OnUnexpected;
}

/** Builds the full API. Fails only if the plugin set is broken, which is a bug to fix at startup. */
export function createAppApi(deps: AppDependencies): Result<PaperLionApi, RegistryError> {
  const registry = createFormatRegistry(deps.plugins, { apiVersion: 3 });
  if (!registry.ok) return registry;
  const statusUpdates = createStatusUpdates();
  const marking = { sessions: deps.sessions, parser: deps.parser, updates: statusUpdates };
  const handlers = createApiHandlers({
    openProject: createOpenProject({
      folderPicker: deps.folderPicker,
      opener: deps.opener,
      registry: registry.value,
      sessions: deps.sessions,
    }),
    listSourceDocuments: createListSourceDocuments({
      sessions: deps.sessions,
      drafts: deps.drafts,
      parser: deps.parser,
    }),
    listCatalogs: createListCatalogs({ sessions: deps.sessions }),
    readCatalog: createReadCatalog({ sessions: deps.sessions }),
    readDocumentPair: createReadDocumentPair({
      sessions: deps.sessions,
      parser: deps.parser,
      drafts: deps.drafts,
    }),
    suggestTargetLanguages: createSuggestTargetLanguages({ sessions: deps.sessions }),
    searchTargetLanguages: createSearchTargetLanguages({ sessions: deps.sessions }),
    chooseTargetLocale: createChooseTargetLocale({ sessions: deps.sessions }),
    saveDocument: createSaveDocument({ sessions: deps.sessions, drafts: deps.drafts }),
    saveDraft: createSaveDraft({ sessions: deps.sessions, drafts: deps.drafts }),
    discardDraft: createDiscardDraft({ sessions: deps.sessions, drafts: deps.drafts }),
    markUpToDate: createMarkUpToDate(marking),
    markExistingUpToDate: createMarkExistingUpToDate(marking),
    checkTranslation: createCheckTranslation({ sessions: deps.sessions, parser: deps.parser }),
  });
  return ok(guardApi(handlers, deps.onUnexpected));
}
