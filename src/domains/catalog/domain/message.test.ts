// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { messageKey } from './message.ts';

describe('messageKey', () => {
  it.each([
    ['a plain key', 'paperl10n-open-folder'],
    ['a key with dots and slashes', 'apihelp-query+info/summary'],
    ['a key with spaces, kept as is', ' spaced key '],
    ['a non-Latin key', 'שלום'],
  ])('accepts %s', (_name, input) => {
    expect(messageKey(input)).toEqual({ ok: true, value: input });
  });

  it('rejects an empty key', () => {
    expect(messageKey('')).toEqual({
      ok: false,
      error: { code: 'message-key.invalid', input: '' },
    });
  });
});
