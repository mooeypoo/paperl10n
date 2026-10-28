// SPDX-License-Identifier: GPL-3.0-or-later
// The picker's sections before the user types (docs/plan/M1-languages.md): languages the project
// already has, the user's recent picks, and suggestions from the operating system's languages and
// region. Never an IP lookup. Pure.
import type { Language, LanguageCatalog } from './language-catalog.ts';

export interface SuggestionInput {
  /** Locale ids the project already has (the plugin's `locales`). */
  readonly projectLocales: readonly string[];
  /** The user's recent picks, most recent first. */
  readonly recent: readonly string[];
  /** The OS languages, best first (`navigator.languages`: `he-IL`, `en-US`). */
  readonly systemLanguages: readonly string[];
  /** Languages not to offer (the other side of the pair). */
  readonly exclude?: readonly string[];
  /** How many of the region's most spoken languages to suggest (default 5). */
  readonly regionCount?: number;
}

export interface LanguageSuggestions {
  readonly inProject: readonly Language[];
  readonly recent: readonly Language[];
  readonly suggested: readonly Language[];
}

/**
 * The languages for an OS language tag: the exact one when the catalog has it (`pt-BR`, `en-US`:
 * regional variants are real localization targets), then its base language (`he-IL` → `he`).
 */
function systemLanguages(catalog: LanguageCatalog, tag: string): (Language | undefined)[] {
  return [catalog.find(tag), catalog.find(tag.split('-')[0] ?? '')];
}

/** The region of the first OS language that has one (`he-IL` → `IL`). */
function systemRegion(systemLanguages: readonly string[]): string | undefined {
  for (const tag of systemLanguages) {
    const region = tag
      .split('-')
      .slice(1)
      .find((subtag) => /^[A-Za-z]{2}$/.test(subtag));
    if (region !== undefined) return region.toUpperCase();
  }
  return undefined;
}

/** Sections in order; a language appears once, in the first section it qualifies for. */
export function suggestLanguages(
  catalog: LanguageCatalog,
  input: SuggestionInput,
): LanguageSuggestions {
  const seen = new Set((input.exclude ?? []).map((code) => catalog.find(code)?.tag ?? code));
  const take = (candidates: readonly (Language | undefined)[], max = Infinity): Language[] => {
    const taken: Language[] = [];
    for (const language of candidates) {
      if (taken.length >= max) break;
      if (language === undefined || seen.has(language.tag)) continue;
      seen.add(language.tag);
      taken.push(language);
    }
    return taken;
  };

  const inProject = take(input.projectLocales.map((code) => catalog.find(code)));
  const recent = take(
    input.recent.map((code) => catalog.find(code)),
    6,
  );
  const region = systemRegion(input.systemLanguages);
  const suggested = take([
    catalog.find('en'),
    ...input.systemLanguages.flatMap((tag) => systemLanguages(catalog, tag)),
    ...(region === undefined
      ? []
      : catalog.languagesOfRegion(region).slice(0, input.regionCount ?? 5)),
  ]);
  return { inProject, recent, suggested };
}
