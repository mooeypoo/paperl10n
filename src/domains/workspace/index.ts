// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `workspace` domain: opening a project folder, its config, and discovering
// translatable resources. Other domains import this file only, as `#domains/workspace`.
// See docs/domains/workspace.md.
export {
  CONFIG_FILE_NAME,
  DEFAULT_SOURCE_LOCALE,
  parseProjectConfig,
  type ConfigProblem,
  type ConfiguredLanguage,
  type InvalidConfig,
  type ParsedConfig,
  type ProjectConfig,
} from './domain/project-config.ts';
export type { ProjectId } from './domain/project-id.ts';
export type { FolderPicker } from './application/ports/folder-picker.ts';
export type {
  FolderUnavailable,
  ProjectFilesOpener,
} from './application/ports/project-files-opener.ts';
export type { OpenedProject, ProjectSessions } from './application/ports/project-sessions.ts';
export {
  createOpenProject,
  type OpenProject,
  type OpenProjectDependencies,
  type OpenProjectError,
  type ProjectSummary,
} from './application/open-project.ts';
export {
  createListSourceDocuments,
  type ListSourceDocuments,
  type ListSourceDocumentsError,
  type SourceDocumentEntry,
  type SourceDocumentList,
} from './application/list-source-documents.ts';
export {
  createCheckTranslation,
  type CheckTranslation,
  type CheckTranslationError,
} from './application/check-translation.ts';
export {
  createMarkExistingUpToDate,
  createMarkUpToDate,
  type MarkExistingUpToDate,
  type MarkUpToDate,
  type MarkUpToDateError,
  type MarkUpToDateRequest,
} from './application/mark-up-to-date.ts';
export {
  createStatusUpdates,
  type DocumentStatus,
  type StatusReadError,
  type StatusUpdates,
} from './application/translation-status.ts';
export {
  createReadDocumentPair,
  type DocumentPair,
  type ReadDocument,
  type ReadDocumentPair,
  type ReadDocumentPairError,
} from './application/read-document-pair.ts';
export {
  createSearchTargetLanguages,
  createSuggestTargetLanguages,
  type SearchTargetLanguages,
  type SuggestionRequest,
  type SuggestTargetLanguages,
  type TargetLanguageSuggestions,
  type TargetLanguagesError,
} from './application/target-languages.ts';
export {
  createChooseTargetLocale,
  type ChooseTargetLocale,
  type ChooseTargetLocaleError,
} from './application/choose-target-locale.ts';
export type { LanguageEntry } from './application/project-languages.ts';
export {
  createSaveDocument,
  type SaveDocument,
  type SaveDocumentError,
  type SaveDocumentRequest,
} from './application/save-document.ts';
export type { FileWriteError, ProjectWriter } from './application/ports/project-writer.ts';
export type {
  Draft,
  DraftKey,
  DraftStore,
  DraftStoreError,
} from './application/ports/draft-store.ts';
export type { OpenedFolder } from './application/ports/project-files-opener.ts';
export {
  createDiscardDraft,
  createSaveDraft,
  type DiscardDraft,
  type DraftError,
  type SaveDraft,
  type SaveDraftRequest,
} from './application/drafts.ts';
