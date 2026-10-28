// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { documentKey } from './source-document.ts';

describe('documentKey', () => {
  it.each([
    ['guide/getting-started', 'guide/getting-started'],
    ['./index', 'index'],
    ['a//b/', 'a/b'],
    ['מדריך/התחלה', 'מדריך/התחלה'],
  ])('accepts %j as %j', (input, expected) => {
    expect(documentKey(input)).toEqual({ ok: true, value: expected });
  });

  it.each([[''], ['.'], ['/abs'], ['../up'], ['a\\b']])('rejects %j', (input) => {
    expect(documentKey(input)).toEqual({
      ok: false,
      error: { code: 'document-key.invalid', input },
    });
  });
});
