// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { readStarlightLocales } from './astro-config.ts';

const config = (locales: string) => `import starlight from '@astrojs/starlight';
export default defineConfig({ integrations: [starlight({ title: 'x', ${locales} })] });`;

describe('readStarlightLocales', () => {
  it.each<[string, string, ReturnType<typeof readStarlightLocales>]>([
    [
      'a root locale and folders, quoted and bare keys',
      config(
        `locales: { root: { label: 'English', lang: 'en' }, he: { label: 'עברית', lang: 'he', dir: 'rtl' }, 'pt-br': { label: 'Português', lang: 'pt-BR' } }`,
      ),
      [
        { folder: '', lang: 'en' },
        { folder: 'he', lang: 'he' },
        { folder: 'pt-br', lang: 'pt-BR' },
      ],
    ],
    [
      'a lang that defaults to the key (and none for root)',
      config(`locales: { root: { label: 'English' }, fr: { label: 'Français' } }`),
      [
        { folder: '', lang: null },
        { folder: 'fr', lang: 'fr' },
      ],
    ],
    [
      'folders named in words, double quotes, trailing commas, and comments',
      config(`locales: {
        // the default
        root: { label: "English", lang: "en" },
        /* Hebrew lives in a named folder */ hebrew: { label: "עברית", lang: "he", },
      },`),
      [
        { folder: '', lang: 'en' },
        { folder: 'hebrew', lang: 'he' },
      ],
    ],
    [
      'braces inside strings and nested objects',
      config(`locales: { root: { label: 'Eng {lish}', lang: 'en', translations: { a: '}' } } }`),
      [{ folder: '', lang: 'en' }],
    ],
    [
      "a lang inside a nested object is not the locale's lang",
      config(`locales: { root: { label: 'English', meta: { lang: 'xx' }, lang: 'en' } }`),
      [{ folder: '', lang: 'en' }],
    ],
  ])('reads %s', (_description, text, expected) => {
    expect(readStarlightLocales(text)).toEqual(expected);
  });

  it.each([
    ['no locales at all', config(`title: 'Docs'`)],
    ['locales from a variable', config(`locales: myLocales`)],
    ['a spread', config(`locales: { ...shared, he: { lang: 'he' } }`)],
    ['a computed key', config(`locales: { [key]: { lang: 'he' } }`)],
    ['a locale from a function call', config(`locales: { he: makeLocale('he') }`)],
    ['a lang from an expression', config(`locales: { he: { lang: process.env.LANG } }`)],
    ['an unterminated object', `locales: { root: { lang: 'en' }`],
    ["Astro's own i18n array form", `i18n: { defaultLocale: 'en', locales: ['en', 'pt-br'] }`],
  ])('gives up (null) on %s', (_description, text) => {
    expect(readStarlightLocales(text)).toBeNull();
  });
});
