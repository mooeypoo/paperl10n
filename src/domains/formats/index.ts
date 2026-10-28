// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `formats` domain for core code: the plugin contracts, the registry, and the
// manifest. Other domains import this file only, as `#domains/formats`. Plugins import
// `#plugin-api` instead. See docs/domains/formats.md.
export {
  formatId,
  type FormatId,
  type FormatKind,
  type InvalidFormatId,
} from './domain/format-id.ts';
export type { Detection, DetectionConfidence } from './domain/detection.ts';
export {
  parsePluginManifest,
  type InvalidManifest,
  type ManifestProblem,
  type PluginManifest,
} from './domain/plugin-manifest.ts';
export {
  SKIPPED_DIRECTORIES,
  type FileAccessError,
  type ProjectFiles,
} from './application/ports/project-files.ts';
export type { FormatContext } from './application/ports/format-context.ts';
export type { FormatError, PluginError } from './application/ports/plugin-error.ts';
export type { DocumentFormat, DocumentLayout } from './application/ports/document-format.ts';
export type { CatalogFormat, CatalogLayout } from './application/ports/catalog-format.ts';
export type { FormatPlugin, PluginHost, PluginModule } from './application/ports/plugin-module.ts';
export {
  createFormatRegistry,
  type DetectedFormat,
  type DetectionReport,
  type FormatRegistry,
  type GuardedCatalogLayout,
  type GuardedDocumentLayout,
  type RegisteredCatalogFormat,
  type RegisteredDocumentFormat,
  type RegisteredFormat,
  type RegistryError,
  type RegistryProblem,
} from './application/format-registry.ts';
