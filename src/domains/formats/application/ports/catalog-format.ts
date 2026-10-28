// SPDX-License-Identifier: GPL-3.0-or-later
// A sketch of the catalog plugin contract. No plugin implements it in M0; it's shaped by M4
// (banana-i18n) and M5 (gettext). It's here so the registry and manifest handle both kinds now.
import type { Message, MessageKey } from '#domains/catalog';
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';
import type { Detection } from '../../domain/detection.ts';
import type { FormatContext } from './format-context.ts';
import type { PluginError } from './plugin-error.ts';
import type { ProjectFiles } from './project-files.ts';

export interface CatalogFormat {
  readonly kind: 'catalog';
  detect(files: ProjectFiles): Promise<Detection>;
  open(context: FormatContext): Promise<Result<CatalogLayout, PluginError>>;
  /** Text → messages, keeping what's needed to write the file back unchanged. */
  parse(text: string, location: CatalogLocation): Result<ParsedCatalog, PluginError>;
  /** Applies changes as patches to the original text; untouched bytes stay identical. */
  serialize(
    original: ParsedCatalog,
    changes: readonly MessageChange[],
  ): Result<string, PluginError>;
  /** Tokens that must survive translation: `$1`, `{{PLURAL:…}}`, `%s`, `{name}`. */
  readonly placeholders: { scan(text: string): readonly PlaceholderToken[] };
}

export interface CatalogLayout {
  /** e.g. `i18n/en.json` (messages), `i18n/qqq.json` (documentation), `i18n/he.json`. */
  listCatalogs(): Promise<Result<readonly CatalogLocation[], PluginError>>;
  catalogPathFor(target: LocaleId): Result<ProjectPath, PluginError>;
}

export interface CatalogLocation {
  readonly path: ProjectPath;
  readonly locale: LocaleId;
  readonly role: 'messages' | 'documentation';
}

export interface ParsedCatalog {
  readonly location: CatalogLocation;
  readonly messages: readonly Message[];
  /** The original text, which serialization patches. */
  readonly source: string;
}

export type MessageChange =
  | { readonly kind: 'set'; readonly key: MessageKey; readonly text: string }
  | { readonly kind: 'remove'; readonly key: MessageKey };

export interface PlaceholderToken {
  readonly text: string;
  /** UTF-16 offsets into the scanned text. */
  readonly start: number;
  readonly end: number;
}
