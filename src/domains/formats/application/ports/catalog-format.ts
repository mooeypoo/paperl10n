// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogKey, Message, MessageKey } from '#domains/catalog';
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';
import type { Detection } from '../../domain/detection.ts';
import type { FormatContext } from './format-context.ts';
import type { PluginError } from './plugin-error.ts';
import type { ProjectFiles } from './project-files.ts';

/**
 * A catalog format plugin (banana-i18n, gettext, …): where a project's message catalogs live, how
 * a catalog file reads and writes, and which pieces of a message must survive translation.
 * Identity (id, name, versions) lives in the plugin's manifest, not here.
 */
export interface CatalogFormat {
  readonly kind: 'catalog';
  /** Does this project look like ours? Cheap: no full-tree reads. */
  detect(files: ProjectFiles): Promise<Detection>;
  /** Loads the system's own config once and returns a layout bound to this project. */
  open(context: FormatContext): Promise<Result<CatalogLayout, PluginError>>;
  /** A catalog file's text → its messages, in file order, with unique keys. Malformed text is a
   * `formats.invalid-catalog` error. The same for a locale's messages and for documentation. */
  parse(text: string): Result<ParsedCatalog, PluginError>;
  /** Writes `edit.changes` into the target's file as patches: bytes outside what changed stay
   * identical, and no changes return the text as read. */
  serialize(edit: CatalogEdit): Result<string, PluginError>;
  /** Tokens that must survive translation: `$1`, `{{PLURAL:…}}`, `%s`, `{name}`. */
  readonly placeholders: { scan(text: string): readonly PlaceholderToken[] };
}

/**
 * One catalog: a set of messages with one file per locale, laid out the system's way. banana-i18n
 * keeps a messages folder (`i18n/en.json`, `i18n/he.json`, and `i18n/qqq.json` for
 * documentation); gettext keeps a domain's files in a folder per locale
 * (`locale/he/LC_MESSAGES/myapp.po`) or side by side (`po/he.po`), from a template (`.pot`).
 */
export interface SourceCatalog {
  /** Its identity, chosen by the plugin (a folder, a domain); unique among the project's catalogs. */
  readonly key: CatalogKey;
  /** The source locale's file (or template). */
  readonly path: ProjectPath;
  readonly locale: LocaleId;
  /** The file documenting each message (banana-i18n's `qqq.json`), when the catalog has one. */
  readonly documentation?: ProjectPath;
}

export interface CatalogLayout {
  /** The locales the project's catalogs have files for (the source locale included), each once.
   * Documentation isn't a locale. */
  readonly locales: readonly LocaleId[];
  /** Every catalog, in a stable order. */
  listCatalogs(): Promise<Result<readonly SourceCatalog[], PluginError>>;
  /** Where `catalog`'s file for `locale` lives, in the layout this project uses. Pure: the file
   * may not exist yet. For the source locale itself, it's the catalog's own path. Systems name
   * these files their own way (`pt-br.json` for `pt-BR`); the plugin knows the mapping. */
  targetPathFor(catalog: SourceCatalog, locale: LocaleId): Result<ProjectPath, PluginError>;
}

export interface ParsedCatalog {
  /** The file's text, which serialization patches. */
  readonly text: string;
  /** In file order, with unique keys. Metadata (banana-i18n's `@metadata`) isn't a message. */
  readonly messages: readonly Message[];
}

/** What to write into one locale's file of a catalog. */
export interface CatalogEdit {
  /** The source locale's file. New messages go after the nearest message before them in the
   * source that the target has (first, when none does), and a new file is shaped like it. */
  readonly source: ParsedCatalog;
  /** The target's file as read, or `null` when it doesn't exist yet. */
  readonly target: ParsedCatalog | null;
  /** Applied in order. Setting a message to its current text, or removing one the target doesn't
   * have, changes nothing. */
  readonly changes: readonly MessageChange[];
}

export type MessageChange =
  | { readonly kind: 'set'; readonly key: MessageKey; readonly text: string }
  | { readonly kind: 'remove'; readonly key: MessageKey };

export type PlaceholderKind = PlaceholderToken['kind'];

/**
 * A piece of a message the translation must keep. Each kind carries what a check compares between
 * a source message and its translation. Tokens may nest (a parameter inside a plural), but never
 * partly overlap.
 */
export type PlaceholderToken = PlaceholderSpan &
  (ParameterToken | PluralToken | GenderToken | LinkToken | TagToken | OtherToken);

interface PlaceholderSpan {
  readonly text: string;
  /** UTF-16 offsets into the scanned text. */
  readonly start: number;
  readonly end: number;
}

/** `$1`, `%s`, `%1$s`, `{name}`: compared by its text. */
interface ParameterToken {
  readonly kind: 'parameter';
}

/** `{{PLURAL:$1|…}}`: compared by the parameter it depends on, as written (`$1`). */
interface PluralToken {
  readonly kind: 'plural';
  readonly parameter: string;
}

/** `{{GENDER:$1|…}}`: compared by its parameter, as written (empty when it has none). */
interface GenderToken {
  readonly kind: 'gender';
  readonly parameter: string;
}

/** `[[Page|text]]`, `[https://… text]`: compared by its target, as written. */
interface LinkToken {
  readonly kind: 'link';
  readonly target: string;
}

/** `<b>`, `</b>`: compared by its name, lowercased. */
interface TagToken {
  readonly kind: 'tag';
  readonly name: string;
}

/** Anything else kept as is (`{{SITENAME}}`, `{{int:…}}`): compared by its text. */
interface OtherToken {
  readonly kind: 'other';
}
