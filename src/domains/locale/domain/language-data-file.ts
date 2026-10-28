// SPDX-License-Identifier: GPL-3.0-or-later
// The shape of the language catalog files (language-data.json, language-names/*.json), written by
// scripts/update-language-data.ts. Decisions: docs/plan/M1-languages.md.

export interface LanguageRecord {
  /** The BCP 47 tag, as MediaWiki gives it: what Paper Lion saves (`pt-BR`). */
  readonly tag: string;
  /** MediaWiki's code (`pt-br`), for systems that use it (banana-i18n). */
  readonly mw: string;
  readonly dir: 'ltr' | 'rtl';
  /** The language's name in itself, when either source knows it. */
  readonly autonym: string | null;
  /** The English name. Names in other interface languages live in their own files. */
  readonly name: string;
  /** ISO 15924 script (`Hebr`), from ULS. */
  readonly script?: string;
  /** ULS region groups (`ME`, `EU`, …). */
  readonly regions?: readonly string[];
  /** Fallback languages, as tags. */
  readonly fallbacks?: readonly string[];
}

export interface LanguageDataFile {
  readonly generated: string;
  readonly sources: readonly {
    readonly name: string;
    readonly url: string;
    readonly license: string;
  }[];
  /** Scripts written right to left, from ULS. */
  readonly rtlScripts: readonly string[];
  /** Sorted by tag. */
  readonly languages: readonly LanguageRecord[];
  /** Lowercase alias (a MediaWiki or deprecated code) → tag. Lookups ignore case, so codes that
   * differ from their tag only in case (`pt-br`) aren't listed. */
  readonly aliases: Readonly<Record<string, string>>;
  /** ISO 3166 region → its languages, most spoken first, as tags. */
  readonly territories: Readonly<Record<string, readonly string[]>>;
}

/** Names in one interface language: tag → name, only where it differs from the English name. */
export type LanguageNamesFile = Readonly<Record<string, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isStringMap = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === 'string');

function isLanguageRecord(value: unknown): value is LanguageRecord {
  return (
    isRecord(value) &&
    typeof value.tag === 'string' &&
    typeof value.mw === 'string' &&
    (value.dir === 'ltr' || value.dir === 'rtl') &&
    (value.autonym === null || typeof value.autonym === 'string') &&
    typeof value.name === 'string' &&
    (value.script === undefined || typeof value.script === 'string') &&
    (value.regions === undefined || isStringList(value.regions)) &&
    (value.fallbacks === undefined || isStringList(value.fallbacks))
  );
}

/** Checks the shape of a catalog file read as JSON. The bundled one is also checked by tests. */
export function isLanguageDataFile(value: unknown): value is LanguageDataFile {
  return (
    isRecord(value) &&
    typeof value.generated === 'string' &&
    Array.isArray(value.sources) &&
    isStringList(value.rtlScripts) &&
    Array.isArray(value.languages) &&
    value.languages.every(isLanguageRecord) &&
    isStringMap(value.aliases) &&
    isRecord(value.territories) &&
    Object.values(value.territories).every(isStringList)
  );
}

export function isLanguageNamesFile(value: unknown): value is LanguageNamesFile {
  return isStringMap(value);
}
