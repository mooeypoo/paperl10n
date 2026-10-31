// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { catalogKey } from './catalog-key.ts';

describe('catalogKey', () => {
  it.each([
    ['a folder', 'i18n/api'],
    ['a gettext domain', 'myapp'],
    ['the project root, as a plugin may name it', '.'],
  ])('accepts %s', (_name, input) => {
    expect(catalogKey(input)).toEqual({ ok: true, value: input });
  });

  it('rejects an empty key', () => {
    expect(catalogKey('')).toEqual({
      ok: false,
      error: { code: 'catalog-key.invalid', input: '' },
    });
  });
});
