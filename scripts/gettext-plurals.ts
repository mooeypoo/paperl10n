// SPDX-License-Identifier: GPL-3.0-or-later
// The gettext plural formulas catalog-gettext writes into a new translation's header
// (`Plural-Forms`), generated from Unicode CLDR by php-gettext/Languages
// (https://php-gettext.github.io/Languages/). Built and checked here; fetched by
// update-gettext-plurals.ts. Decisions: docs/plan/M5-second-plugins.md (G2).

/** One language as php-gettext/Languages publishes it (the fields this uses). */
export interface PublishedLanguage {
  readonly plurals: number;
  readonly formulas: { readonly standard: string };
}

export interface PluralFormsFile {
  /** When it was generated (YYYY-MM-DD). */
  readonly generated: string;
  readonly sources: readonly {
    readonly name: string;
    readonly url: string;
    readonly license: string;
  }[];
  /** gettext language name (`he`, `pt_PT`) → how many forms, and the formula picking one. */
  readonly languages: Readonly<
    Record<string, { readonly plurals: number; readonly formula: string }>
  >;
}

export function buildPluralForms(
  published: Readonly<Record<string, PublishedLanguage>>,
  generated: string,
  source: { readonly name: string; readonly url: string },
): PluralFormsFile {
  const languages: Record<string, { plurals: number; formula: string }> = {};
  for (const name of Object.keys(published).sort()) {
    const language = published[name];
    if (language === undefined) continue;
    languages[name] = { plurals: language.plurals, formula: language.formulas.standard };
  }
  return {
    generated,
    sources: [{ ...source, license: 'MIT; CLDR data: Unicode-3.0' }],
    languages,
  };
}

/** The file as written: one language per line, so an update reads as a diff of languages. */
export function serializePluralForms(file: PluralFormsFile): string {
  const line = (value: unknown) => JSON.stringify(value);
  return [
    '{',
    `  "generated": ${line(file.generated)},`,
    `  "sources": ${line(file.sources)},`,
    '  "languages": {',
    Object.entries(file.languages)
      .map(([name, value]) => `    ${line(name)}: ${line(value)}`)
      .join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}
