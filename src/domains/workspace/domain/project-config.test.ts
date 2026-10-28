// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseProjectConfig } from './project-config.ts';

const json = (value: unknown) => JSON.stringify(value);

function problemFields(text: string): string[] {
  const result = parseProjectConfig(text);
  return result.ok ? [] : result.error.problems.map((p) => p.field);
}

describe('parseProjectConfig', () => {
  it('parses a full config', () => {
    expect(
      parseProjectConfig(
        json({
          $schema: './schema.json',
          sourceLocale: 'EN',
          targetLocale: 'he-il',
          documentFormat: 'format-stub',
          formatOptions: { 'format-stub': { root: 'docs' } },
          languages: { rhg: { dir: 'ltr' }, 'ART-x-lantern': { name: ' Lanternese ', dir: 'rtl' } },
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        config: {
          sourceLocale: 'en',
          targetLocale: 'he-IL',
          documentFormat: 'format-stub',
          formatOptions: { 'format-stub': { root: 'docs' } },
          languages: [
            { tag: 'rhg', direction: 'ltr' },
            { tag: 'art-x-lantern', name: 'Lanternese', direction: 'rtl' },
          ],
        },
        warnings: [],
      },
    });
  });

  it('defaults the source locale to en and the options to none', () => {
    expect(parseProjectConfig(json({ targetLocale: 'he' }))).toEqual({
      ok: true,
      value: {
        config: { sourceLocale: 'en', targetLocale: 'he', formatOptions: {}, languages: [] },
        warnings: [],
      },
    });
  });

  it('warns about unknown keys instead of failing', () => {
    const result = parseProjectConfig(json({ targetLocale: 'he', theme: 'dark', locales: [] }));
    expect(result.ok && result.value.warnings).toEqual([
      'unknown key "theme" is ignored',
      'unknown key "locales" is ignored',
    ]);
  });

  it.each<[string, unknown, string[]]>([
    ['no targetLocale', {}, ['targetLocale']],
    ['an invalid targetLocale', { targetLocale: 'pt_BR' }, ['targetLocale']],
    ['a non-string targetLocale', { targetLocale: 7 }, ['targetLocale']],
    ['a non-string sourceLocale', { sourceLocale: ['en'], targetLocale: 'he' }, ['sourceLocale']],
    ['the same source and target', { sourceLocale: 'he', targetLocale: 'HE' }, ['targetLocale']],
    ['an empty documentFormat', { targetLocale: 'he', documentFormat: '' }, ['documentFormat']],
    ['a non-string documentFormat', { targetLocale: 'he', documentFormat: 3 }, ['documentFormat']],
    [
      'formatOptions that is not an object',
      { targetLocale: 'he', formatOptions: [] },
      ['formatOptions'],
    ],
    [
      "a plugin's options that are not an object",
      { targetLocale: 'he', formatOptions: { 'format-stub': 'docs' } },
      ['formatOptions.format-stub'],
    ],
    ['languages that is not an object', { targetLocale: 'he', languages: ['he'] }, ['languages']],
    [
      'a language code that is not a locale id',
      { targetLocale: 'he', languages: { pt_BR: { name: 'x' } } },
      ['languages.pt_BR'],
    ],
    [
      'a language entry that is not an object',
      { targetLocale: 'he', languages: { rhg: 'ltr' } },
      ['languages.rhg'],
    ],
    [
      'a language with an unknown key',
      { targetLocale: 'he', languages: { rhg: { direction: 'ltr' } } },
      ['languages.rhg'],
    ],
    [
      'a language with an empty name',
      { targetLocale: 'he', languages: { rhg: { name: '  ' } } },
      ['languages.rhg.name'],
    ],
    [
      'a language with a bad direction',
      { targetLocale: 'he', languages: { rhg: { dir: 'right' } } },
      ['languages.rhg.dir'],
    ],
    [
      'several problems at once',
      { targetLocale: 'xx_YY', documentFormat: 1, formatOptions: 2 },
      ['targetLocale', 'documentFormat', 'formatOptions'],
    ],
  ])('reports %s', (_description, config, fields) => {
    expect(problemFields(json(config))).toEqual(fields);
  });

  it('accepts a long but well-formed language subtag (syntax only; meaning comes in M1)', () => {
    // "english" is 7 letters, a syntactically valid (if unregistered) language subtag.
    expect(parseProjectConfig(json({ sourceLocale: 'english', targetLocale: 'he' })).ok).toBe(true);
  });

  it.each([
    ['not JSON', '{ targetLocale: he }', 'not valid JSON'],
    ['a JSON array', '[]', 'must be a JSON object'],
    ['JSON null', 'null', 'must be a JSON object'],
  ])('reports %s as a file problem', (_description, text, message) => {
    const result = parseProjectConfig(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.problems).toHaveLength(1);
      expect(result.error.problems[0]?.field).toBe('(file)');
      expect(result.error.problems[0]?.problem).toContain(message);
    }
  });
});
