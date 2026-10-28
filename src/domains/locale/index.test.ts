// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as locale from '#domains/locale';

describe('#domains/locale public API', () => {
  it('exports exactly the intended names', () => {
    expect(Object.keys(locale).sort()).toEqual([
      'bundledLanguageCatalog',
      'createLanguageCatalog',
      'foldForSearch',
      'localeFrom',
      'parseLocale',
      'searchLanguages',
      'suggestLanguages',
    ]);
  });

  it('works through the alias', () => {
    expect(locale.parseLocale('ar')).toEqual({ ok: true, value: { id: 'ar', direction: 'rtl' } });
  });
});
