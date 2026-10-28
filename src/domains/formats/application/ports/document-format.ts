// SPDX-License-Identifier: GPL-3.0-or-later
import type { SourceDocument } from '#domains/document';
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';
import type { Detection } from '../../domain/detection.ts';
import type { FormatContext } from './format-context.ts';
import type { PluginError } from './plugin-error.ts';
import type { ProjectFiles } from './project-files.ts';

/**
 * A longform format plugin (VitePress, Starlight, …): where documents live for each locale.
 * Layout only; Markdown parsing belongs to the `document` domain. Identity (id, name, versions)
 * lives in the plugin's manifest, not here.
 */
export interface DocumentFormat {
  readonly kind: 'document';
  /** Does this project look like ours? Cheap: no full-tree reads. */
  detect(files: ProjectFiles): Promise<Detection>;
  /** Loads the system's own config once and returns a layout bound to this project. */
  open(context: FormatContext): Promise<Result<DocumentLayout, PluginError>>;
}

/** A locale the project already has, and the folder its pages live in. */
export interface ProjectLocale {
  readonly locale: LocaleId;
  /** Project-relative. Systems name these folders their own way (`pt-br/`, `hebrew/`, the root);
   * the plugin knows the mapping, the rest of the app only sees locale ids. */
  readonly folder: ProjectPath;
}

export interface DocumentLayout {
  /** The locales this project already has (the source locale included), each with its folder:
   * declared in the system's own config, or found on disk. Unique by locale. */
  readonly locales: readonly ProjectLocale[];
  /** Every document in the source locale, in a stable order, with unique keys. */
  listSourceDocuments(): Promise<Result<readonly SourceDocument[], PluginError>>;
  /** Where `document`'s counterpart in `target` lives. Pure: the file may not exist yet.
   * For the source locale itself, it's the document's own path. */
  targetPathFor(document: SourceDocument, target: LocaleId): Result<ProjectPath, PluginError>;
}
