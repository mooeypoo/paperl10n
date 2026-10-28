// SPDX-License-Identifier: GPL-3.0-or-later
// Finding a language by what the user types: its code, its own name, its English name, or its
// name in the interface language, in any script. Pure; the picker (L5) shows the results.
import type { Language, LanguageCatalog } from './language-catalog.ts';

/** Lowercase, without diacritics (`Português` → `portugues`), so typing is forgiving. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('und');
}

/** Lower is better. */
const Rank = {
  ExactCode: 0,
  ExactName: 1,
  NamePrefix: 2,
  WordPrefix: 3,
  Contains: 4,
  None: 99,
} as const;
type Rank = (typeof Rank)[keyof typeof Rank];

function rankName(name: string, query: string): Rank {
  const folded = foldForSearch(name);
  if (folded === query) return Rank.ExactName;
  if (folded.startsWith(query)) return Rank.NamePrefix;
  if (folded.split(/[\s()\-/,]+/u).some((word) => word.startsWith(query))) return Rank.WordPrefix;
  if (folded.includes(query)) return Rank.Contains;
  return Rank.None;
}

function rankLanguage(
  language: Language,
  query: string,
  catalog: LanguageCatalog,
  uiLanguage: string,
): Rank {
  // A code the user typed exactly (`pt-br`, `pt-BR`, `sr-el`) wins outright.
  if (catalog.find(query)?.tag === language.tag) return Rank.ExactCode;
  const names = [language.autonym, language.name, catalog.nameIn(language, uiLanguage)];
  let best: Rank = foldForSearch(language.tag).startsWith(query) ? Rank.NamePrefix : Rank.None;
  for (const name of names) {
    if (name !== null) {
      const rank = rankName(name, query);
      if (rank < best) best = rank;
    }
  }
  return best;
}

/**
 * Languages matching `query`, best first: an exact code, then an exact name, a name that starts
 * with it, a word that starts with it, then a name that contains it. Ties go to languages with a
 * known autonym (better-documented languages), then to the shorter name, then the tag.
 */
export function searchLanguages(
  catalog: LanguageCatalog,
  query: string,
  options: { readonly uiLanguage: string; readonly limit?: number },
): Language[] {
  const folded = foldForSearch(query.trim());
  if (folded === '') return [];
  const ranked = catalog.languages
    .map((language) => ({
      language,
      rank: rankLanguage(language, folded, catalog, options.uiLanguage),
    }))
    .filter((entry) => entry.rank !== Rank.None);
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(a.language.autonym === null) - Number(b.language.autonym === null) ||
      a.language.name.length - b.language.name.length ||
      (a.language.tag < b.language.tag ? -1 : 1),
  );
  return ranked.slice(0, options.limit ?? 50).map((entry) => entry.language);
}
