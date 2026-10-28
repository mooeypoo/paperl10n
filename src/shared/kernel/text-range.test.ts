// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { sliceRange, textRange } from './text-range.ts';

describe('textRange', () => {
  it.each([
    [0, 0],
    [2, 5],
  ])('accepts [%i, %i)', (start, end) => {
    expect(textRange(start, end)).toEqual({ start, end });
  });

  it.each([
    [-1, 2],
    [3, 2],
    [0.5, 2],
    [0, Number.NaN],
  ])('rejects [%s, %s)', (start, end) => {
    expect(() => textRange(start, end)).toThrow(RangeError);
  });

  it('slices in UTF-16 code units, so a surrogate pair counts as two', () => {
    const text = 'a😀b';
    expect(sliceRange(text, textRange(1, 3))).toBe('😀');
    expect(sliceRange(text, textRange(3, 4))).toBe('b');
  });
});
