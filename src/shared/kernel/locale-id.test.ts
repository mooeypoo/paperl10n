// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import { localeId, type LocaleId } from '#kernel/locale-id';

describe('localeId', () => {
  it.each([
    ['en', 'en'],
    ['he', 'he'],
    ['HE', 'he'],
    ['he-il', 'he-IL'],
    ['pt-BR', 'pt-BR'],
    ['zh-hans', 'zh-Hans'],
    ['ZH-HANT-tw', 'zh-Hant-TW'],
    ['az-arab', 'az-Arab'],
    ['es-419', 'es-419'],
    ['be-tarask', 'be-tarask'],
    ['sl-rozaj-biske', 'sl-rozaj-biske'],
    ['de-CH-1996', 'de-CH-1996'],
    ['qqq', 'qqq'],
    ['en-x-pirate', 'en-x-pirate'],
    ['ckb', 'ckb'],
  ])('accepts %j as %j', (input, expected) => {
    expect(localeId(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [''],
    ['e'],
    ['english-but-too-long'],
    ['abcd'],
    ['pt_BR'],
    ['en-'],
    ['-en'],
    ['en--US'],
    ['en-US-US'],
    ['sl-rozaj-rozaj'],
    ['en-x'],
    ['en-x-waytoolongsubtag'],
    ['en-u-ca-hebrew'],
    ['root'],
    ['he IL'],
  ])('rejects %j', (input) => {
    expect(localeId(input)).toEqual({ ok: false, error: { code: 'locale-id.invalid', input } });
  });

  it('is branded: a plain string is not a LocaleId', () => {
    expectTypeOf<string>().not.toExtend<LocaleId>();
  });
});
