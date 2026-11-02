// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { rowHeightOf, rowTop, scrollToShow, visibleRows, type OpenRow } from './visible-rows';

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

  // Rows of 50 px; row 10 is open, 300 px high: it spans 500–800, and row 11 starts at 800.
  const open: OpenRow = { index: 10, height: 300 };
  it.each<[string, number, number, OpenRow | null, { start: number; end: number }]>([
    ['above the open row', 0, 400, open, { start: 0, end: 8 }],
    ['the open row reaching into the view', 300, 400, open, { start: 6, end: 11 }],
    ['inside the open row', 600, 100, open, { start: 10, end: 11 }],
    ['the rows after the open one, moved down by it', 800, 100, open, { start: 11, end: 13 }],
    ['far below the open row', 5800, 100, open, { start: 111, end: 113 }],
    [
      'an open row no taller than a row',
      800,
      100,
      { index: 10, height: 40 },
      { start: 16, end: 18 },
    ],
    ['an open row past the list', 800, 100, { index: 1500, height: 300 }, { start: 16, end: 18 }],
    ['an open row before the list', 800, 100, { index: -1, height: 300 }, { start: 16, end: 18 }],
  ])('renders %s', (_name, scrollTop, viewport, openRow, expected) => {
    expect(visibleRows(1000, 50, scrollTop, viewport, 0, openRow)).toEqual(expected);
  });
});

describe('rowTop and rowHeightOf', () => {
  const open: OpenRow = { index: 10, height: 300 };
  it.each([
    [0, 0, 50],
    [9, 450, 50],
    [10, 500, 300],
    [11, 800, 50],
    [100, 5250, 50],
  ])('places row %i at %i px, %i px high, after an open row', (index, top, height) => {
    expect(rowTop(index, 50, open)).toBe(top);
    expect(rowHeightOf(index, 50, open)).toBe(height);
  });

  it('places rows evenly with no open row, and gives the list’s end', () => {
    expect(rowTop(11, 50)).toBe(550);
    expect(rowHeightOf(10, 50)).toBe(50);
    expect(rowTop(1000, 50, open)).toBe(50_250);
  });
});

describe('scrollToShow', () => {
  const open: OpenRow = { index: 10, height: 300 };
  it.each([
    ['a row in view: unchanged', 3, 0, 400, null, 0],
    ['a row above the view: its top at the top', 3, 400, 400, null, 150],
    ['a row below the view: its bottom at the bottom', 20, 0, 400, null, 650],
    ['the open row below the view: all of it', 10, 0, 400, open, 400],
    ['a row after the open one', 12, 0, 400, open, 500],
    ['an open row taller than the view: its top', 10, 0, 200, open, 500],
    ['the open row partly above the view: its top', 10, 600, 400, open, 500],
  ])('scrolls for %s', (_name, index, scrollTop, viewport, openRow, expected) => {
    expect(scrollToShow(index, 50, scrollTop, viewport, openRow)).toBe(expected);
  });
});
