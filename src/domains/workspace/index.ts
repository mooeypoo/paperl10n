// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `workspace` domain: opening a project folder, its config, and discovering
// translatable resources. Other domains import this file only, as `#domains/workspace`.
// See docs/domains/workspace.md.
export {
  CONFIG_FILE_NAME,
  DEFAULT_SOURCE_LOCALE,
  parseProjectConfig,
  type ConfigProblem,
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
} from './application/list-source-documents.ts';
export {
  createReadDocumentPair,
  type DocumentPair,
  type ReadDocument,
  type ReadDocumentPair,
  type ReadDocumentPairError,
} from './application/read-document-pair.ts';
