// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { localeFrom, parseLocale, type TextDirection } from './locale.ts';

function id(raw: string): LocaleId {
  const result = localeId(raw);
  if (!result.ok) throw new Error(`test setup: invalid locale id ${raw}`);
  return result.value;
}

describe('localeFrom', () => {
  it.each<[string, TextDirection]>([
    // Languages usually written right to left
    ['he', 'rtl'],
    ['ar', 'rtl'],
    ['fa', 'rtl'],
    ['ur', 'rtl'],
    ['yi', 'rtl'],
    ['ckb', 'rtl'],
    ['ps', 'rtl'],
    ['dv', 'rtl'],
    ['ug', 'rtl'],
    ['iw', 'rtl'],
    // Region doesn't change direction
    ['he-IL', 'rtl'],
    ['ar-EG', 'rtl'],
    ['en-IL', 'ltr'],
    // Left to right, including unknown languages
    ['en', 'ltr'],
    ['pt-BR', 'ltr'],
    ['de-CH-1996', 'ltr'],
    ['be-tarask', 'ltr'],
    ['zh-Hant-TW', 'ltr'],
    ['tlh', 'ltr'],
    // An explicit script decides, in both directions
    ['az-Arab', 'rtl'],
    ['pa-Arab', 'rtl'],
    ['ku-Arab', 'rtl'],
    ['tzm-Tfng', 'ltr'],
    ['az-Latn', 'ltr'],
    ['ku-Latn', 'ltr'],
    ['ur-Latn', 'ltr'],
    ['he-Latn', 'ltr'],
    ['sd-Deva', 'ltr'],
    ['ar-Arab-EG', 'rtl'],
    // Message documentation and private use
    ['qqq', 'ltr'],
    ['en-x-pirate', 'ltr'],
    ['he-x-test', 'rtl'],
    ['en-x-arab', 'ltr'],
  ])('%s is %s', (raw, direction) => {
    expect(localeFrom(id(raw))).toEqual({ id: raw, direction });
  });
});

describe('parseLocale', () => {
  it('canonicalizes and adds the direction', () => {
    expect(parseLocale('HE-il')).toEqual({ ok: true, value: { id: 'he-IL', direction: 'rtl' } });
  });

  it.each([['pt_BR'], [''], ['root']])('rejects %j with the kernel error', (input) => {
    expect(parseLocale(input)).toEqual({ ok: false, error: { code: 'locale-id.invalid', input } });
  });
});
