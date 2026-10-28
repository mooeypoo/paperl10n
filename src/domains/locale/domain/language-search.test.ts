// SPDX-License-Identifier: GPL-3.0-or-later
// Against the real bundled catalog: the queries people actually type.
import { describe, expect, it } from 'vitest';
import { bundledLanguageCatalog } from './bundled-catalog.ts';
import { foldForSearch, searchLanguages } from './language-search.ts';

const catalog = bundledLanguageCatalog();
const first = (query: string, uiLanguage = 'en') =>
  searchLanguages(catalog, query, { uiLanguage })[0]?.tag;

describe('foldForSearch', () => {
  it.each([
    ['Português', 'portugues'],
    ['ČEŠTINA', 'cestina'],
    ['עברית', 'עברית'],
    ['  Mixed ', '  mixed '],
  ])('%s → %s', (input, expected) => {
    expect(foldForSearch(input)).toBe(expected);
  });
});

describe('searchLanguages', () => {
  it.each([
    ['an exact tag', 'pt-BR', 'pt-BR'],
    ['a MediaWiki code', 'pt-br', 'pt-BR'],
    ['an alias', 'sr-el', 'sr-Latn'],
    ['an English name', 'Hebrew', 'he'],
    ['an English name, any case', 'hebrew', 'he'],
    ['an autonym in its own script', 'עברית', 'he'],
    ['an autonym without its accents', 'portugues', 'pt'],
    ['an Arabic autonym', 'العربية', 'ar'],
    ['a name in the interface language', 'ערבית', 'ar'],
  ])('finds the language by %s', (_description, query, tag) => {
    expect(first(query, 'he')).toBe(tag);
  });

  it('puts names that start with the query before names that only contain it', () => {
    const tags = searchLanguages(catalog, 'portug', { uiLanguage: 'en' }).map((l) => l.tag);
    expect(tags.slice(0, 2)).toEqual(['pt', 'pt-BR']);
  });

  it('finds every language whose name has a word starting with the query', () => {
    const tags = searchLanguages(catalog, 'brazil', { uiLanguage: 'en' }).map((l) => l.tag);
    expect(tags).toContain('pt-BR');
  });

  it('returns nothing for an empty query, and at most the limit', () => {
    expect(searchLanguages(catalog, '   ', { uiLanguage: 'en' })).toEqual([]);
    expect(searchLanguages(catalog, 'a', { uiLanguage: 'en', limit: 5 })).toHaveLength(5);
  });

  it('is stable: the same query gives the same order', () => {
    expect(searchLanguages(catalog, 'ar', { uiLanguage: 'en' })).toEqual(
      searchLanguages(catalog, 'ar', { uiLanguage: 'en' }),
    );
  });
});
