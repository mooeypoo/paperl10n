// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin API: the ONLY module format plugins import (`#plugin-api`). If plugins are ever
// extracted into packages, this file becomes `@paperl10n/plugin-api`, and each plugin changes one
// import line. Keep it small and made of plain data and interfaces: no classes, no registry, no
// core internals. Its export list is frozen by plugin-api.test.ts; changing it is a deliberate,
// visible diff (and a reason to consider a new apiVersion).

// Kernel primitives and their constructors
export { err, ok, type Result } from '#kernel/result';
export { PROJECT_ROOT, projectPath, type ProjectPath } from '#kernel/project-path';
export { localeId, type LocaleId } from '#kernel/locale-id';

// Documents and messages
export { documentKey, type DocumentKey, type SourceDocument } from '#domains/document';
export { messageKey, type Message, type MessageKey } from '#domains/catalog';

// The contracts plugins implement, and what they receive
export type { Detection, DetectionConfidence } from './domain/detection.ts';
export type { FileAccessError, ProjectFiles } from './application/ports/project-files.ts';
export type { FormatContext } from './application/ports/format-context.ts';
export type { PluginError } from './application/ports/plugin-error.ts';
export type {
  DocumentFormat,
  DocumentLayout,
  ProjectLocale,
} from './application/ports/document-format.ts';
export type {
  CatalogEdit,
  CatalogFormat,
  CatalogLayout,
  MessageChange,
  ParsedCatalog,
  PlaceholderKind,
  PlaceholderToken,
  SourceCatalog,
} from './application/ports/catalog-format.ts';
export type { FormatPlugin, PluginHost, PluginModule } from './application/ports/plugin-module.ts';
