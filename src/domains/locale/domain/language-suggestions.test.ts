// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { bundledLanguageCatalog } from './bundled-catalog.ts';
import { suggestLanguages } from './language-suggestions.ts';

const catalog = bundledLanguageCatalog();
const tags = (languages: readonly { tag: string }[]) => languages.map((l) => l.tag);

describe('suggestLanguages', () => {
  it("suggests English, the OS languages, then the region's most spoken, once each", () => {
    const result = suggestLanguages(catalog, {
      projectLocales: [],
      recent: [],
      systemLanguages: ['he-IL', 'en-US'],
    });
    // he-IL isn't in the catalog, so Hebrew; en-US is (American English), and English is already in.
    expect(tags(result.suggested)).toEqual(['en', 'he', 'en-US', 'ar', 'apc', 'ru']);
  });

  it('lists project languages first and never repeats them', () => {
    const result = suggestLanguages(catalog, {
      projectLocales: ['en', 'he', 'pt-br'],
      recent: ['he', 'fr'],
      systemLanguages: ['he-IL'],
    });
    expect(tags(result.inProject)).toEqual(['en', 'he', 'pt-BR']);
    expect(tags(result.recent)).toEqual(['fr']);
    expect(tags(result.suggested)).not.toContain('he');
    expect(tags(result.suggested)).not.toContain('en');
  });

  it('keeps at most six recent languages, most recent first', () => {
    const result = suggestLanguages(catalog, {
      projectLocales: [],
      recent: ['fr', 'de', 'es', 'it', 'nl', 'sv', 'da', 'fi'],
      systemLanguages: [],
    });
    expect(tags(result.recent)).toEqual(['fr', 'de', 'es', 'it', 'nl', 'sv']);
  });

  it('leaves out excluded languages (the other side of the pair)', () => {
    const result = suggestLanguages(catalog, {
      projectLocales: ['en', 'he'],
      recent: [],
      systemLanguages: ['en-US'],
      exclude: ['en'],
    });
    expect(tags(result.inProject)).toEqual(['he']);
    expect(tags(result.suggested)).not.toContain('en');
  });

  it('offers the exact OS language and then its base language, and skips unknown codes', () => {
    const result = suggestLanguages(catalog, {
      projectLocales: ['zz-unknown'],
      recent: ['xx'],
      systemLanguages: ['pt-PT', 'qaa'],
      regionCount: 0,
    });
    expect(result.inProject).toEqual([]);
    expect(result.recent).toEqual([]);
    expect(tags(result.suggested)).toEqual(['en', 'pt-PT', 'pt']);
  });

  it('works with no OS region at all', () => {
    const result = suggestLanguages(catalog, {
      projectLocales: [],
      recent: [],
      systemLanguages: ['fr'],
    });
    expect(tags(result.suggested)).toEqual(['en', 'fr']);
  });
});
