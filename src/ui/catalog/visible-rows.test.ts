// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { visibleRows } from './visible-rows';

describe('visibleRows', () => {
  it.each([
    ['the top of a long list', 5000, 50, 0, 500, 5, { start: 0, end: 15 }],
    ['a row partly scrolled out at the top', 5000, 50, 125, 500, 0, { start: 2, end: 13 }],
    ['the middle, with overscan on both sides', 5000, 50, 10_000, 500, 5, { start: 195, end: 215 }],
    ['the end of the list', 100, 50, 4800, 500, 5, { start: 91, end: 100 }],
    ['a list shorter than the view', 3, 50, 0, 500, 5, { start: 0, end: 3 }],
    ['an empty list', 0, 50, 0, 500, 5, { start: 0, end: 0 }],
    ['an unknown row height', 100, 0, 0, 500, 5, { start: 0, end: 0 }],
    ['a scroll past the end (after the list shrank)', 10, 50, 9000, 500, 2, { start: 10, end: 10 }],
    ['an overscrolled top (elastic scrolling)', 100, 50, -40, 100, 1, { start: 0, end: 3 }],
  ])('renders %s', (_name, count, rowHeight, scrollTop, viewport, overscan, expected) => {
    expect(visibleRows(count, rowHeight, scrollTop, viewport, overscan)).toEqual(expected);
  });
});
