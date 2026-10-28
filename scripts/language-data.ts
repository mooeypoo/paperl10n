// SPDX-License-Identifier: GPL-3.0-or-later
// Builds Paper Lion's language catalog from MediaWiki's languageinfo and Wikimedia's ULS language
// data. Pure, so it's tested without the network; scripts/update-language-data.ts fetches and
// writes. Decisions: docs/plan/M1-languages.md.

/** One entry of MediaWiki's `meta=languageinfo` (liprop=code|bcp47|dir|autonym|name|fallbacks). */
export interface LanguageInfoEntry {
  readonly code: string;
  readonly bcp47: string;
  readonly dir: 'ltr' | 'rtl';
  readonly autonym: string;
  readonly name: string;
  readonly fallbacks: readonly string[];
}

/** `@wikimedia/language-data`'s data file. A one-element language entry is a redirect. */
export interface UlsData {
  readonly languages: Readonly<
    Record<string, readonly [string] | readonly [string, readonly string[], string]>
  >;
  readonly rtlscripts: readonly string[];
  readonly territories: Readonly<Record<string, readonly string[]>>;
}

export interface LanguageRecord {
  /** The BCP 47 tag, as MediaWiki gives it: what Paper Lion saves (`pt-BR`). */
  readonly tag: string;
  /** MediaWiki's code (`pt-br`), for systems that use it (banana-i18n). */
  readonly mw: string;
  readonly dir: 'ltr' | 'rtl';
  /** The language's name in itself, when either source knows it. */
  readonly autonym: string | null;
  /** Names in the app's interface languages; `en` always, others only when they differ. */
  readonly names: Readonly<Record<string, string>>;
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

export interface BuildInput {
  readonly generated: string;
  readonly sources: LanguageDataFile['sources'];
  /** languageinfo with `uselang=en`. */
  readonly languageInfo: Readonly<Record<string, LanguageInfoEntry>>;
  /** Names in other interface languages: interface language → (MediaWiki code → name). */
  readonly localizedNames: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly uls: UlsData;
}

export interface BuildResult {
  readonly data: LanguageDataFile;
  /** Codes whose direction came from their script, against languageinfo (for the update log). */
  readonly directionFromScript: readonly string[];
}

/** MediaWiki's special codes: documentation, multiple, undetermined, no linguistic content. */
export const EXCLUDED_CODES: readonly string[] = [
  'qqq',
  'qqx',
  'mis',
  'mul',
  'und',
  'zxx',
  'en-x-piglatin',
];

/**
 * MediaWiki's BCP 47 tag, checked but never canonicalized: `Intl.getCanonicalLocales` applies
 * CLDR's alias table, which merges languages MediaWiki (and localization) keeps apart: Tagalog
 * into Filipino, Serbo-Croatian and Montenegrin into Serbian, Dari into Persian.
 */
export function checkedTag(bcp47: string): string {
  Intl.getCanonicalLocales(bcp47); // throws on a malformed tag
  return bcp47;
}

export function buildLanguageData(input: BuildInput): BuildResult {
  const { uls } = input;
  const ulsEntry = (code: string) => {
    let entry = uls.languages[code];
    if (entry?.length === 1) entry = uls.languages[entry[0]];
    return entry?.length === 3 ? entry : undefined;
  };
  const rtlScripts = new Set(uls.rtlscripts);

  // Group MediaWiki codes by their BCP 47 tag; several old codes can share one (`sr-ec`, `sr-cyrl`).
  const groups = new Map<string, LanguageInfoEntry[]>();
  for (const entry of Object.values(input.languageInfo)) {
    if (EXCLUDED_CODES.includes(entry.code)) continue;
    const tag = checkedTag(entry.bcp47);
    const group = groups.get(tag.toLowerCase()) ?? [];
    group.push(entry);
    groups.set(tag.toLowerCase(), group);
  }

  const tagOf = new Map<string, string>();
  const aliases: Record<string, string> = {};
  const chosen: { tag: string; entry: LanguageInfoEntry }[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.code.localeCompare(b.code));
    const tag = checkedTag(sorted[0]?.bcp47 ?? '');
    // The code that *is* the tag wins (`be-tarask` over `be-x-old`), else the first.
    const main = sorted.find((e) => e.code === tag.toLowerCase()) ?? sorted[0];
    if (main === undefined) continue;
    chosen.push({ tag, entry: main });
    for (const entry of group) {
      tagOf.set(entry.code, tag);
      if (entry.code !== tag.toLowerCase()) aliases[entry.code] = tag;
    }
  }
  // ULS redirects (`sr` → `sr-cyrl`, `ajp` → `apc`) are aliases too, when they lead somewhere known.
  for (const [code, entry] of Object.entries(uls.languages)) {
    if (entry.length !== 1 || tagOf.has(code)) continue;
    const target = tagOf.get(entry[0]);
    if (target !== undefined) {
      tagOf.set(code, target);
      aliases[code] = target;
    }
  }

  const directionFromScript: string[] = [];
  const languages = chosen
    .map(({ tag, entry }): LanguageRecord => {
      const fromUls = ulsEntry(entry.code);
      const scriptIsRtl = fromUls !== undefined && rtlScripts.has(fromUls[0]);
      // languageinfo only knows the direction of languages MediaWiki has interface messages for;
      // for the rest it says "ltr". A right-to-left script settles it.
      if (scriptIsRtl && entry.dir !== 'rtl') directionFromScript.push(entry.code);
      const names: Record<string, string> = { en: entry.name };
      for (const [uiLanguage, localized] of Object.entries(input.localizedNames)) {
        const name = localized[entry.code];
        if (name !== undefined && name !== entry.name) names[uiLanguage] = name;
      }
      const fallbacks = entry.fallbacks
        .map((code) => tagOf.get(code))
        .filter((t): t is string => t !== undefined && t !== tag);
      return {
        tag,
        mw: entry.code,
        dir: entry.dir === 'rtl' || scriptIsRtl ? 'rtl' : 'ltr',
        autonym: entry.autonym !== '' ? entry.autonym : fromUls?.[2] || null,
        names,
        ...(fromUls === undefined ? {} : { script: fromUls[0], regions: [...fromUls[1]] }),
        ...(fallbacks.length === 0 ? {} : { fallbacks: [...new Set(fallbacks)] }),
      };
    })
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const territories: Record<string, string[]> = {};
  for (const region of Object.keys(uls.territories).sort()) {
    const tags = (uls.territories[region] ?? [])
      .map((code) => tagOf.get(code))
      .filter((t): t is string => t !== undefined);
    if (tags.length > 0) territories[region] = [...new Set(tags)];
  }

  return {
    data: {
      generated: input.generated,
      sources: input.sources,
      rtlScripts: [...uls.rtlscripts].sort(),
      languages,
      aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => (a < b ? -1 : 1))),
      territories,
    },
    directionFromScript: directionFromScript.sort(),
  };
}

/** Stable JSON: one language, alias, or territory per line, so updates diff cleanly. */
export function serializeLanguageData(data: LanguageDataFile): string {
  const line = (value: unknown) => JSON.stringify(value);
  const entries = (record: Readonly<Record<string, unknown>>) =>
    Object.entries(record).map(([key, value]) => `    ${line(key)}: ${line(value)}`);
  return [
    '{',
    `  "generated": ${line(data.generated)},`,
    `  "sources": ${line(data.sources)},`,
    `  "rtlScripts": ${line(data.rtlScripts)},`,
    '  "languages": [',
    data.languages.map((record) => `    ${line(record)}`).join(',\n'),
    '  ],',
    '  "aliases": {',
    entries(data.aliases).join(',\n'),
    '  },',
    '  "territories": {',
    entries(data.territories).join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}
