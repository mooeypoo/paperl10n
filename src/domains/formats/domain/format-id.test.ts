// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatId, kindOfFormatId, type FormatId } from './format-id.ts';

describe('formatId', () => {
  it.each([
    ['format-vitepress'],
    ['format-astro-starlight'],
    ['catalog-banana'],
    ['catalog-gettext2'],
  ])('accepts %j', (input) => {
    expect(formatId(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    ['vitepress'],
    ['format-'],
    ['format-VitePress'],
    ['format_vitepress'],
    ['format--double'],
    ['format-trailing-'],
    ['plugin-x'],
    [''],
  ])('rejects %j', (input) => {
    expect(formatId(input)).toEqual({ ok: false, error: { code: 'format-id.invalid', input } });
  });
});

describe('kindOfFormatId', () => {
  it('reads the kind from the prefix', () => {
    expect(kindOfFormatId('format-x' as FormatId)).toBe('document');
    expect(kindOfFormatId('catalog-x' as FormatId)).toBe('catalog');
  });
});
