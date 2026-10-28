// SPDX-License-Identifier: GPL-3.0-or-later
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bundledLanguageCatalog, bundledNames } from './bundled-catalog.ts';

describe('the bundled catalog', () => {
  it('bundles every names file in language-names/', () => {
    const files = readdirSync(new URL('./language-names/', import.meta.url))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .sort();
    expect(Object.keys(bundledNames).sort()).toEqual(files);
  });

  it('loads once, with over 1,400 languages', () => {
    expect(bundledLanguageCatalog()).toBe(bundledLanguageCatalog());
    expect(bundledLanguageCatalog().languages.length).toBeGreaterThan(1400);
  });

  it.each([
    ['he', 'rtl', 'עברית'],
    ['ar', 'rtl', 'العربية'],
    ['en', 'ltr', 'English'],
    ['ydd', 'rtl', null],
  ])('knows %s (%s)', (tag, direction, autonym) => {
    const language = bundledLanguageCatalog().find(tag);
    expect(language?.direction).toBe(direction);
    if (autonym !== null) expect(language?.autonym).toBe(autonym);
  });

  it('names languages in Hebrew', () => {
    const catalog = bundledLanguageCatalog();
    const portuguese = catalog.find('pt-BR');
    if (portuguese === undefined) throw new Error('test setup');
    expect(catalog.nameIn(portuguese, 'he')).not.toBe(portuguese.name);
  });
});
