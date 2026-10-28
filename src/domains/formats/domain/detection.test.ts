// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { compareMatches, type DetectionConfidence } from './detection.ts';

describe('compareMatches', () => {
  it('orders by confidence, then by id', () => {
    const matches: { id: string; confidence: DetectionConfidence }[] = [
      { id: 'format-b', confidence: 'fallback' },
      { id: 'format-z', confidence: 'likely' },
      { id: 'format-a', confidence: 'fallback' },
      { id: 'format-y', confidence: 'certain' },
      { id: 'format-c', confidence: 'likely' },
    ];
    expect([...matches].sort(compareMatches).map((m) => m.id)).toEqual([
      'format-y',
      'format-c',
      'format-z',
      'format-a',
      'format-b',
    ]);
  });

  it('treats identical entries as equal', () => {
    expect(
      compareMatches({ id: 'x', confidence: 'likely' }, { id: 'x', confidence: 'likely' }),
    ).toBe(0);
  });
});
