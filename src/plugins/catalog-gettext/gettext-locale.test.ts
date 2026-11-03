// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId } from '#plugin-api';
import { gettextName, localeFromGettext } from './gettext-locale.ts';

const locale = (raw: string): LocaleId => {
  const id = localeId(raw);
  if (!id.ok) throw new Error(`test setup: ${raw}`);
  return id.value;
};

describe('gettext locale names', () => {
  it.each<[string, string]>([
    ['he', 'he'],
    ['pt_BR', 'pt-BR'],
    ['pt-br', 'pt-BR'],
    ['sr@latin', 'sr-Latn'],
    ['sr_RS@latin', 'sr-Latn-RS'],
    ['uz@cyrillic', 'uz-Cyrl'],
    ['zh_Hans', 'zh-Hans'],
    ['ca@valencia', 'ca-valencia'],
    ['de_DE.UTF-8', 'de-DE'],
    ['es_419', 'es-419'],
  ])('reads %s as %s', (name, id) => {
    expect(localeFromGettext(name)).toBe(id);
  });

  it.each(['LINGUAS', 'messages', 'django', 'en_US_POSIX', 'x', ''])(
    'reads %j as no locale',
    (name) => {
      expect(localeFromGettext(name)).toBeUndefined();
    },
  );

  it.each<[string, string]>([
    ['he', 'he'],
    ['pt-BR', 'pt_BR'],
    ['sr-Latn', 'sr@latin'],
    ['sr-Latn-RS', 'sr_RS@latin'],
    ['zh-Hans', 'zh_Hans'],
    ['ca-valencia', 'ca@valencia'],
    ['es-419', 'es_419'],
  ])('names %s as %s, and back', (id, name) => {
    expect(gettextName(locale(id))).toBe(name);
    expect(localeFromGettext(name)).toBe(id);
  });
});
