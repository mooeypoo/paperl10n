// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findFrontmatter, frontmatterKeys } from './frontmatter.ts';

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

describe('frontmatterKeys', () => {
  const keys = (text: string) => {
    const location = findFrontmatter(text);
    if (location === null) throw new Error('test setup');
    return frontmatterKeys(text, location).map(({ name, range }) => [
      name,
      text.slice(range.start, range.end),
    ]);
  };

  it.each<[string, string, string[][]]>([
    [
      'top-level YAML keys, not nested ones, list items, or comments',
      '---\ntitle: Hi\nsidebar:\n  order: 2\ntags:\n  - a\n# note: x\ndescription: "a: b"\n---\n',
      [
        ['title', 'title'],
        ['sidebar', 'sidebar'],
        ['tags', 'tags'],
        ['description', 'description'],
      ],
    ],
    [
      'quoted YAML keys, without their quotes',
      '---\n"a b": 1\n\'c\': 2\n---\n',
      [
        ['a b', '"a b"'],
        ['c', "'c'"],
      ],
    ],
    ['a colon inside a value, or a URL', '---\nurl: https://x.org\n---\n', [['url', 'url']]],
    ['not a key without a space after its colon', '---\nhttp://x\n---\n', []],
    [
      'TOML keys and tables',
      '+++\ntitle = "Hi"\n[params]\n  author = "x"\n[[menu]]\n+++\n',
      [
        ['title', 'title'],
        ['params', '[params]'],
        ['menu', '[[menu]]'],
      ],
    ],
    ['CRLF lines', '---\r\ntitle: Hi\r\n---\r\n', [['title', 'title']]],
    ['an empty frontmatter', '---\n---\n', []],
  ])('reads %s', (_description, text, expected) => {
    expect(keys(text)).toEqual(expected);
  });
});
