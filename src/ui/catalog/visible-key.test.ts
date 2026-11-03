// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { visibleKey } from './visible-key';

describe('visibleKey', () => {
  it.each([
    ['paperl10n-open-folder', 'paperl10n-open-folder'],
    ['menu\u0004Open', 'menu␄Open'],
    ['a\tb\nc\u0000', 'a␉b␊c␀'],
    ['שלום %s', 'שלום %s'],
  ])('shows %j as %j', (key, shown) => {
    expect(visibleKey(key)).toBe(shown);
  });
});
