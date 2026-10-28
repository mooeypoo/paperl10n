// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { autonym } from './language-name';

describe('autonym', () => {
  it.each([
    ['en', 'English'],
    ['he', 'עברית'],
    ['ar', 'العربية'],
    ['fr', 'Français'],
    ['pt-BR', 'Português (Brasil)'],
  ])('names %s in its own language: %s', (id, expected) => {
    expect(autonym(id)).toBe(expected);
  });

  it.each([['zz'], ['not a locale'], ['']])('falls back to the id for %j', (id) => {
    expect(autonym(id)).toBe(id);
  });
});
