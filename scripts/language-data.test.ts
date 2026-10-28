// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  buildLanguageData,
  serializeLanguageData,
  type BuildInput,
  type LanguageInfoEntry,
  type UlsData,
} from './language-data.ts';

const info = (code: string, fields: Partial<LanguageInfoEntry> = {}): LanguageInfoEntry => ({
  code,
  bcp47: code,
  dir: 'ltr',
  autonym: `${code}-autonym`,
  name: `${code}-English`,
  fallbacks: [],
  ...fields,
});

const uls: UlsData = {
  languages: {
    he: ['Hebr', ['ME'], 'עברית'],
    ydd: ['Hebr', ['EU'], 'אידיש'],
    abe: ['Latn', ['AM'], 'Wôbanakiôdwawôgan'],
    sr: ['sr-cyrl'],
    'sr-cyrl': ['Cyrl', ['EU'], 'српски'],
    ajp: ['apc'],
    apc: ['Arab', ['ME'], 'شامي'],
  },
  rtlscripts: ['Hebr', 'Arab'],
  territories: { IL: ['he', 'en', 'ajp', 'xx-unknown', 'he'], ZZ: ['nothing-known'] },
};

function build(languageInfo: Record<string, LanguageInfoEntry>, extra: Partial<BuildInput> = {}) {
  return buildLanguageData({
    generated: '2026-10-28',
    sources: [],
    languageInfo,
    localizedNames: {},
    uls,
    ...extra,
  });
}

const byTag = (result: ReturnType<typeof build>, tag: string) =>
  result.data.languages.find((language) => language.tag === tag);

describe('buildLanguageData', () => {
  it('leaves out MediaWiki special codes', () => {
    const result = build(
      Object.fromEntries(['en', 'qqq', 'qqx', 'mul', 'und', 'zxx', 'mis'].map((c) => [c, info(c)])),
    );
    expect(result.data.languages.map((l) => l.tag)).toEqual(['en']);
  });

  it('keeps the BCP 47 tag, and the MediaWiki code beside it', () => {
    const result = build({ 'pt-br': info('pt-br', { bcp47: 'pt-BR' }) });
    expect(byTag(result, 'pt-BR')).toMatchObject({ tag: 'pt-BR', mw: 'pt-br' });
    // Lookups ignore case, so a code that differs from its tag only in case needs no alias.
    expect(result.data.aliases).toEqual({});
  });

  it('never merges distinct languages through CLDR aliases (tl, sh, prs stay themselves)', () => {
    const result = build({
      tl: info('tl'),
      fil: info('fil'),
      sh: info('sh', { bcp47: 'sh' }),
      prs: info('prs'),
    });
    expect(result.data.languages.map((l) => l.tag)).toEqual(['fil', 'prs', 'sh', 'tl']);
  });

  it('rejects a malformed tag', () => {
    expect(() => build({ bad: info('bad', { bcp47: 'not a tag!' }) })).toThrow(RangeError);
  });

  it('merges codes that share a tag; the code that is the tag wins, the others become aliases', () => {
    const result = build({
      'be-tarask': info('be-tarask'),
      'be-x-old': info('be-x-old', { bcp47: 'be-tarask' }),
      'sr-ec': info('sr-ec', { bcp47: 'sr-Cyrl' }),
      'sr-cyrl': info('sr-cyrl', { bcp47: 'sr-Cyrl' }),
    });
    expect(result.data.languages.map((l) => [l.tag, l.mw])).toEqual([
      ['be-tarask', 'be-tarask'],
      ['sr-Cyrl', 'sr-cyrl'],
    ]);
    expect(result.data.aliases).toMatchObject({ 'be-x-old': 'be-tarask', 'sr-ec': 'sr-Cyrl' });
  });

  it('takes the script and regions from ULS, following its redirects, and aliases the redirects', () => {
    const result = build({ 'sr-cyrl': info('sr-cyrl', { bcp47: 'sr-Cyrl' }), apc: info('apc') });
    expect(byTag(result, 'sr-Cyrl')).toMatchObject({ script: 'Cyrl', regions: ['EU'] });
    expect(result.data.aliases).toEqual({ sr: 'sr-Cyrl', ajp: 'apc' });
  });

  it('is right to left when either source says so, and reports when only the script did', () => {
    const result = build({ he: info('he', { dir: 'rtl' }), ydd: info('ydd'), abe: info('abe') });
    expect([
      byTag(result, 'he')?.dir,
      byTag(result, 'ydd')?.dir,
      byTag(result, 'abe')?.dir,
    ]).toEqual(['rtl', 'rtl', 'ltr']);
    expect(result.directionFromScript).toEqual(['ydd']);
  });

  it('takes the autonym from languageinfo, then ULS, else none', () => {
    const result = build({
      he: info('he', { autonym: 'עברית' }),
      abe: info('abe', { autonym: '' }),
      zzz: info('zzz', { autonym: '' }),
    });
    expect([
      byTag(result, 'he')?.autonym,
      byTag(result, 'abe')?.autonym,
      byTag(result, 'zzz')?.autonym,
    ]).toEqual(['עברית', 'Wôbanakiôdwawôgan', null]);
  });

  it('keeps names in other interface languages only when they differ from English', () => {
    const result = build(
      { he: info('he', { name: 'Hebrew' }), xyz: info('xyz', { name: 'Xyz' }) },
      { localizedNames: { he: { he: 'עברית', xyz: 'Xyz' } } },
    );
    expect(byTag(result, 'he')?.names).toEqual({ en: 'Hebrew', he: 'עברית' });
    expect(byTag(result, 'xyz')?.names).toEqual({ en: 'Xyz' });
  });

  it('maps fallbacks to tags, dropping unknown ones and the language itself', () => {
    const result = build({
      'pt-br': info('pt-br', { bcp47: 'pt-BR', fallbacks: ['pt', 'nope', 'pt-br'] }),
      pt: info('pt'),
    });
    expect(byTag(result, 'pt-BR')?.fallbacks).toEqual(['pt']);
    expect(byTag(result, 'pt')?.fallbacks).toBeUndefined();
  });

  it('maps territories to tags in order, without unknown codes or duplicates', () => {
    const result = build({ he: info('he'), en: info('en'), apc: info('apc') });
    expect(result.data.territories).toEqual({ IL: ['he', 'en', 'apc'] });
  });

  it('sorts languages by tag and aliases by key', () => {
    const result = build({
      zu: info('zu'),
      af: info('af'),
      'pt-br': info('pt-br', { bcp47: 'pt-BR' }),
      'zz-old': info('zz-old', { bcp47: 'af' }),
      'be-x-old': info('be-x-old', { bcp47: 'af' }),
    });
    expect(result.data.languages.map((l) => l.tag)).toEqual(['af', 'pt-BR', 'zu']);
    expect(Object.keys(result.data.aliases)).toEqual(['be-x-old', 'zz-old']);
  });
});

describe('serializeLanguageData', () => {
  const { data } = build({
    he: info('he', { dir: 'rtl' }),
    'sr-el': info('sr-el', { bcp47: 'sr-Latn' }),
  });

  it('round-trips through JSON', () => {
    expect(JSON.parse(serializeLanguageData(data))).toEqual(data);
  });

  it('puts one language, alias, or territory per line, so updates diff cleanly', () => {
    const lines = serializeLanguageData(data).split('\n');
    expect(lines.filter((line) => line.startsWith('    {"tag":'))).toHaveLength(2);
    expect(lines).toContain('    "sr-el": "sr-Latn"');
  });
});
