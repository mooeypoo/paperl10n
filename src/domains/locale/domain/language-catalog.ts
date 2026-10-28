// SPDX-License-Identifier: GPL-3.0-or-later
// The languages Paper Lion knows (docs/domains/locale.md, "The language catalog"), and the ones a
// project adds or adjusts in its config. Pure: the data is passed in.
import type { LocaleId } from '#kernel/locale-id';
import { localeId } from '#kernel/locale-id';
import type { LanguageDataFile, LanguageNamesFile } from './language-data-file.ts';
import type { TextDirection } from './locale.ts';

export interface Language {
  readonly tag: LocaleId;
  /** MediaWiki's code (`pt-br`); a custom language's is its tag in lowercase. */
  readonly mw: string;
  readonly direction: TextDirection;
  /** The language's name in itself, when known. */
  readonly autonym: string | null;
  /** The English name (a custom language's own name, or its tag). */
  readonly name: string;
  readonly script: string | null;
  /** ULS region groups (`ME`, `EU`, …). */
  readonly regions: readonly string[];
  readonly fallbacks: readonly LocaleId[];
  /** Added or adjusted by the project's config. */
  readonly custom: boolean;
}

/** A language a project defines or adjusts in `paperl10n.config.json` (`languages`). */
export interface CustomLanguage {
  readonly tag: LocaleId;
  readonly name?: string;
  readonly direction?: TextDirection;
}

export interface LanguageCatalog {
  /** Every language, sorted by tag. */
  readonly languages: readonly Language[];
  /** By tag or alias, ignoring case: `pt-br`, `pt-BR`, `sr-el` (→ `sr-Latn`). */
  find(code: string): Language | undefined;
  /** A region's languages (`IL`), most spoken first. */
  languagesOfRegion(region: string): readonly Language[];
  /** The language's name in an interface language, falling back to English. */
  nameIn(language: Language, uiLanguage: string): string;
  /** This catalog with a project's custom languages added, or known ones adjusted. */
  withCustom(custom: readonly CustomLanguage[]): LanguageCatalog;
}

interface CatalogParts {
  readonly languages: readonly Language[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly territories: Readonly<Record<string, readonly string[]>>;
  readonly names: Readonly<Record<string, LanguageNamesFile>>;
}

function catalogFrom(parts: CatalogParts): LanguageCatalog {
  const byLowerTag = new Map(
    parts.languages.map((language) => [language.tag.toLowerCase(), language]),
  );
  const find = (code: string): Language | undefined => {
    const lower = code.toLowerCase();
    const alias = parts.aliases[lower];
    return (
      byLowerTag.get(lower) ??
      (alias === undefined ? undefined : byLowerTag.get(alias.toLowerCase()))
    );
  };
  return {
    languages: parts.languages,
    find,
    languagesOfRegion: (region) =>
      (parts.territories[region.toUpperCase()] ?? []).flatMap((tag) => {
        const language = find(tag);
        return language === undefined ? [] : [language];
      }),
    nameIn: (language, uiLanguage) =>
      uiLanguage === 'en'
        ? language.name
        : (parts.names[uiLanguage]?.[language.tag] ?? language.name),
    withCustom(custom) {
      const languages = new Map(
        parts.languages.map((language) => [language.tag.toLowerCase(), language]),
      );
      for (const entry of custom) {
        const known = find(entry.tag);
        const base: Language = known ?? {
          tag: entry.tag,
          mw: entry.tag.toLowerCase(),
          direction: 'ltr',
          autonym: null,
          name: entry.tag,
          script: null,
          regions: [],
          fallbacks: [],
          custom: true,
        };
        languages.set(base.tag.toLowerCase(), {
          ...base,
          ...(entry.name === undefined
            ? {}
            : { name: entry.name, autonym: known?.autonym ?? entry.name }),
          ...(entry.direction === undefined ? {} : { direction: entry.direction }),
          custom: true,
        });
      }
      const sorted = [...languages.values()].sort((a, b) =>
        a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0,
      );
      return catalogFrom({ ...parts, languages: sorted });
    },
  };
}

/** A catalog from the generated files. Tags that aren't valid locale ids are skipped (the
 * generator already leaves them out). */
export function createLanguageCatalog(
  data: LanguageDataFile,
  names: Readonly<Record<string, LanguageNamesFile>> = {},
): LanguageCatalog {
  const asLocale = (tag: string): LocaleId | undefined => {
    const id = localeId(tag);
    return id.ok ? id.value : undefined;
  };
  const languages = data.languages.flatMap((record): Language[] => {
    const tag = asLocale(record.tag);
    if (tag === undefined) return [];
    return [
      {
        tag,
        mw: record.mw,
        direction: record.dir,
        autonym: record.autonym,
        name: record.name,
        script: record.script ?? null,
        regions: record.regions ?? [],
        fallbacks: (record.fallbacks ?? []).flatMap((fallback) => {
          const id = asLocale(fallback);
          return id === undefined ? [] : [id];
        }),
        custom: false,
      },
    ];
  });
  languages.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return catalogFrom({ languages, aliases: data.aliases, territories: data.territories, names });
}
