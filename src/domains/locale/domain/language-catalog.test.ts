// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { createLanguageCatalog } from './language-catalog.ts';
import type { LanguageDataFile } from './language-data-file.ts';

const id = (raw: string): LocaleId => {
  const result = localeId(raw);
  if (!result.ok) throw new Error(raw);
  return result.value;
};

const data: LanguageDataFile = {
  generated: '2026-10-28',
  sources: [],
  rtlScripts: ['Hebr'],
  languages: [
    {
      tag: 'en',
      mw: 'en',
      dir: 'ltr',
      autonym: 'English',
      name: 'English',
      script: 'Latn',
      regions: ['EU'],
    },
    {
      tag: 'he',
      mw: 'he',
      dir: 'rtl',
      autonym: 'עברית',
      name: 'Hebrew',
      script: 'Hebr',
      regions: ['ME'],
    },
    {
      tag: 'pt-BR',
      mw: 'pt-br',
      dir: 'ltr',
      autonym: 'português do Brasil',
      name: 'Brazilian Portuguese',
      fallbacks: ['pt'],
    },
    { tag: 'pt', mw: 'pt', dir: 'ltr', autonym: 'português', name: 'Portuguese' },
    {
      tag: 'sr-Latn',
      mw: 'sr-latn',
      dir: 'ltr',
      autonym: 'srpski',
      name: 'Serbian (Latin script)',
    },
    { tag: 'rhg', mw: 'rhg', dir: 'rtl', autonym: null, name: 'Rohingya' },
    {
      tag: 'nl-u-SD-bebru',
      mw: 'nl-u-sd-bebru',
      dir: 'ltr',
      autonym: null,
      name: 'Brussels Dutch',
    },
  ],
  aliases: { 'sr-el': 'sr-Latn' },
  territories: { IL: ['he', 'en', 'unknown'], BR: ['pt-BR'] },
};
const catalog = createLanguageCatalog(data, { he: { he: 'עברית', 'pt-BR': 'פורטוגזית ברזילאית' } });

describe('createLanguageCatalog', () => {
  it.each([
    ['a tag', 'pt-BR', 'pt-BR'],
    ['a tag in another case', 'PT-br', 'pt-BR'],
    ['a MediaWiki code that differs only in case', 'pt-br', 'pt-BR'],
    ['an alias', 'sr-el', 'sr-Latn'],
    ['an alias in another case', 'SR-EL', 'sr-Latn'],
  ])('finds a language by %s', (_description, code, tag) => {
    expect(catalog.find(code)?.tag).toBe(tag);
  });

  it.each([['xx'], [''], ['pt-PT']])('finds nothing for %j', (code) => {
    expect(catalog.find(code)).toBeUndefined();
  });

  it('skips entries whose tag is not a valid locale id', () => {
    expect(catalog.find('nl-u-SD-bebru')).toBeUndefined();
    expect(catalog.languages.map((l) => l.tag)).toEqual([
      'en',
      'he',
      'pt',
      'pt-BR',
      'rhg',
      'sr-Latn',
    ]);
  });

  it('turns records into languages: direction, script, regions, fallbacks', () => {
    expect(catalog.find('pt-BR')).toEqual({
      tag: 'pt-BR',
      mw: 'pt-br',
      direction: 'ltr',
      autonym: 'português do Brasil',
      name: 'Brazilian Portuguese',
      script: null,
      regions: [],
      fallbacks: ['pt'],
      custom: false,
    });
  });

  it("lists a region's languages in order, skipping unknown codes", () => {
    expect(catalog.languagesOfRegion('il').map((l) => l.tag)).toEqual(['he', 'en']);
    expect(catalog.languagesOfRegion('ZZ')).toEqual([]);
  });

  it('names languages in an interface language, falling back to English', () => {
    const portuguese = catalog.find('pt-BR');
    const serbian = catalog.find('sr-Latn');
    if (portuguese === undefined || serbian === undefined) throw new Error('test setup');
    expect(catalog.nameIn(portuguese, 'he')).toBe('פורטוגזית ברזילאית');
    expect(catalog.nameIn(serbian, 'he')).toBe('Serbian (Latin script)');
    expect(catalog.nameIn(portuguese, 'en')).toBe('Brazilian Portuguese');
    expect(catalog.nameIn(portuguese, 'fr')).toBe('Brazilian Portuguese');
  });
});

describe('withCustom', () => {
  const custom = catalog.withCustom([
    { tag: id('rhg'), direction: 'ltr' },
    { tag: id('tlh'), name: 'tlhIngan Hol' },
    { tag: id('art-x-lantern'), name: 'Lanternese', direction: 'rtl' },
  ]);

  it('adjusts a known language, keeping its other facts', () => {
    expect(custom.find('rhg')).toMatchObject({
      tag: 'rhg',
      direction: 'ltr',
      name: 'Rohingya',
      custom: true,
    });
  });

  it('adds unknown languages, findable and sorted with the rest', () => {
    expect(custom.find('art-x-lantern')).toMatchObject({
      name: 'Lanternese',
      autonym: 'Lanternese',
      direction: 'rtl',
      custom: true,
    });
    expect(custom.find('tlh')).toMatchObject({ name: 'tlhIngan Hol', direction: 'ltr' });
    expect(custom.languages.map((l) => l.tag)).toEqual([
      'art-x-lantern',
      'en',
      'he',
      'pt',
      'pt-BR',
      'rhg',
      'sr-Latn',
      'tlh',
    ]);
  });

  it('names a language without a name by its tag', () => {
    expect(catalog.withCustom([{ tag: id('zzz') }]).find('zzz')?.name).toBe('zzz');
  });

  it('leaves the original catalog alone', () => {
    expect(catalog.find('rhg')?.direction).toBe('rtl');
    expect(catalog.find('art-x-lantern')).toBeUndefined();
  });

  it('still finds aliases', () => {
    expect(custom.find('sr-el')?.tag).toBe('sr-Latn');
  });
});
