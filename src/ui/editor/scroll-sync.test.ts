// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { matchingHeight, matchingHeights } from './scroll-sync.ts';

describe('matchingHeights', () => {
  it.each([
    [
      'the tops and ends only, without pairs',
      [],
      [
        [0, 10],
        [1000, 500],
      ],
    ],
    [
      'each pair with both sides, in order',
      [[200, 100], null, [600, 400]],
      [
        [0, 10],
        [200, 100],
        [600, 400],
        [1000, 500],
      ],
    ],
    // A pair whose start is above an earlier one's, on either side, would make the panes jump.
    [
      'not a pair that goes back up here',
      [
        [200, 100],
        [150, 300],
      ],
      [
        [0, 10],
        [200, 100],
        [1000, 500],
      ],
    ],
    [
      'nor one that goes back up there',
      [
        [200, 100],
        [300, 50],
      ],
      [
        [0, 10],
        [200, 100],
        [1000, 500],
      ],
    ],
    [
      'nor one at the same height here',
      [
        [200, 100],
        [200, 300],
      ],
      [
        [0, 10],
        [200, 100],
        [1000, 500],
      ],
    ],
    // At the same height there it's flat: a stretch here whose pair has no room there.
    [
      'but one at the same height there',
      [
        [200, 100],
        [300, 100],
      ],
      [
        [0, 10],
        [200, 100],
        [300, 100],
        [1000, 500],
      ],
    ],
    [
      'nor a pair below the end',
      [[1200, 100]],
      [
        [0, 10],
        [1000, 500],
      ],
    ],
  ] as const)('%s', (_description, pairs, expected) => {
    expect(matchingHeights([0, 10], pairs, [1000, 500])).toEqual(expected);
  });
});

describe('matchingHeight', () => {
  const matches = [
    [0, 10],
    [200, 100],
    [600, 500],
  ] as const;
  it.each([
    ['at a match, its pair', 200, 100],
    ['at the top, the top', 0, 10],
    ['between matches, the same share of the way', 400, 300],
    ['a quarter of the way', 50, 32.5],
    ['past the end, by as much as past it', 700, 600],
    ['above the top, by as much as above it', -20, -10],
  ])('%s', (_description, height, expected) => {
    expect(matchingHeight(matches, height)).toBe(expected);
  });

  it('stays put across a flat stretch, then moves on', () => {
    const flat = [
      [0, 0],
      [100, 100],
      [300, 100],
      [400, 200],
    ] as const;
    expect([150, 250, 350].map((height) => matchingHeight(flat, height))).toEqual([100, 100, 150]);
  });
});
