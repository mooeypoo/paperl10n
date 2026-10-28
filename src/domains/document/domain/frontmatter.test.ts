// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findFrontmatter } from './frontmatter.ts';

describe('findFrontmatter', () => {
  it.each<[string, string, { format: string; range: [number, number]; bodyStart: number }]>([
    ['YAML', '---\na: 1\n---\nBody\n', { format: 'yaml', range: [0, 12], bodyStart: 13 }],
    ['TOML', '+++\na = 1\n+++\nBody', { format: 'toml', range: [0, 13], bodyStart: 14 }],
    ['after a BOM', '\uFEFF---\na: 1\n---\n', { format: 'yaml', range: [1, 13], bodyStart: 14 }],
    ['with CRLF', '---\r\na: 1\r\n---\r\nBody', { format: 'yaml', range: [0, 14], bodyStart: 16 }],
    ['empty', '---\n---\n', { format: 'yaml', range: [0, 7], bodyStart: 8 }],
    ['at the very end', '---\na: 1\n---', { format: 'yaml', range: [0, 12], bodyStart: 12 }],
    [
      'ignoring --- lines of the other kind',
      '+++\na: ---\n---\n+++\n',
      { format: 'toml', range: [0, 18], bodyStart: 19 },
    ],
  ])('finds %s frontmatter', (_description, text, expected) => {
    const found = findFrontmatter(text);
    expect(found).toEqual({
      format: expected.format,
      range: { start: expected.range[0], end: expected.range[1] },
      bodyStart: expected.bodyStart,
    });
  });

  it.each([
    ['no fence', '# Title\n---\n'],
    ['an unclosed fence', '---\na: 1\n\nBody\n'],
    ['a fence with trailing text', '--- yaml\na: 1\n---\n'],
    ['a fence that is not first', '\n---\na: 1\n---\n'],
    ['a longer fence', '----\na: 1\n----\n'],
    ['an empty document', ''],
  ])('finds none with %s', (_description, text) => {
    expect(findFrontmatter(text)).toBeNull();
  });
});
