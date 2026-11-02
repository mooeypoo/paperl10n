// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { stepTo, type Step } from './message-navigation';

describe('stepTo', () => {
  const even = (index: number) => index % 2 === 0;
  it.each<
    [string, number, number | null, Step, ((index: number) => boolean) | undefined, number | null]
  >([
    ['the next row', 5, 1, 1, undefined, 2],
    ['the previous row', 5, 1, -1, undefined, 0],
    ['nothing after the last row (no wrapping)', 5, 4, 1, undefined, null],
    ['nothing before the first row (no wrapping)', 5, 0, -1, undefined, null],
    ['the first row, going down with none open', 5, null, 1, undefined, 0],
    ['the last row, going up with none open', 5, null, -1, undefined, 4],
    ['the next matching row, past others', 6, 0, 1, even, 2],
    ['the previous matching row, past others', 6, 5, -1, even, 4],
    ['the first matching row, with none open', 6, null, 1, (index) => index > 2, 3],
    ['nothing when no later row matches', 6, 4, 1, even, null],
    ['nothing in an empty list', 0, null, 1, undefined, null],
  ])('finds %s', (_name, count, from, step, matches, expected) => {
    expect(stepTo(count, from, step, matches)).toBe(expected);
  });
});
