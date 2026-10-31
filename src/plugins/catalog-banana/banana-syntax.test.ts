// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { scanBanana } from './banana-syntax.ts';

/** Tokens without offsets, for readable tables; offsets are checked separately. */
function kinds(text: string) {
  return scanBanana(text).map((token) => {
    const { start, end, ...rest } = token;
    expect(text.slice(start, end)).toBe(token.text);
    return rest;
  });
}

describe('scanBanana', () => {
  it.each<[string, string, ReturnType<typeof kinds>]>([
    ['plain text', 'Hello there', []],
    [
      'parameters',
      '$1 and $2, then $10',
      [
        { kind: 'parameter', text: '$1' },
        { kind: 'parameter', text: '$2' },
        { kind: 'parameter', text: '$10' },
      ],
    ],
    ['a dollar alone', 'Costs $ 5', []],
    [
      'a plural, with the parameters inside it',
      '{{PLURAL:$1|one item|$1 items}}',
      [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1|one item|$1 items}}' },
        { kind: 'parameter', text: '$1' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    [
      'a lowercase plural with spaces',
      '{{ plural : $2 |a|b}}',
      [
        { kind: 'plural', parameter: '$2', text: '{{ plural : $2 |a|b}}' },
        { kind: 'parameter', text: '$2' },
      ],
    ],
    [
      'a plural without forms',
      '{{PLURAL:$1}}',
      [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1}}' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    [
      'a plural over a magic word',
      '{{PLURAL:{{NUMBEROFPAGES}}|page|pages}}',
      [
        {
          kind: 'plural',
          parameter: '{{NUMBEROFPAGES}}',
          text: '{{PLURAL:{{NUMBEROFPAGES}}|page|pages}}',
        },
        { kind: 'other', text: '{{NUMBEROFPAGES}}' },
      ],
    ],
    [
      'a gender',
      '{{GENDER:$1|he|she|they}}',
      [
        { kind: 'gender', parameter: '$1', text: '{{GENDER:$1|he|she|they}}' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    [
      'a gender of the reader (no parameter)',
      '{{GENDER:|you (m)|you (f)}}',
      [{ kind: 'gender', parameter: '', text: '{{GENDER:|you (m)|you (f)}}' }],
    ],
    [
      'a gender inside a plural',
      '{{PLURAL:$1|{{GENDER:$2|he|she}} has one|many}}',
      [
        {
          kind: 'plural',
          parameter: '$1',
          text: '{{PLURAL:$1|{{GENDER:$2|he|she}} has one|many}}',
        },
        { kind: 'parameter', text: '$1' },
        { kind: 'gender', parameter: '$2', text: '{{GENDER:$2|he|she}}' },
        { kind: 'parameter', text: '$2' },
      ],
    ],
    [
      'magic words and other templates',
      '{{SITENAME}} {{int:ok}} {{GRAMMAR:genitive|$1}}',
      [
        { kind: 'other', text: '{{SITENAME}}' },
        { kind: 'other', text: '{{int:ok}}' },
        { kind: 'other', text: '{{GRAMMAR:genitive|$1}}' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    [
      'an internal link',
      'See [[Special:Example|the page]].',
      [{ kind: 'link', target: 'Special:Example', text: '[[Special:Example|the page]]' }],
    ],
    [
      'an internal link without text, and one holding a plural',
      '[[Help]] [[$1|{{PLURAL:$2|a|b}}]]',
      [
        { kind: 'link', target: 'Help', text: '[[Help]]' },
        { kind: 'link', target: '$1', text: '[[$1|{{PLURAL:$2|a|b}}]]' },
        { kind: 'parameter', text: '$1' },
        { kind: 'plural', parameter: '$2', text: '{{PLURAL:$2|a|b}}' },
        { kind: 'parameter', text: '$2' },
      ],
    ],
    [
      'external links',
      '[https://example.org/a?b=1 the site] and [//example.org $1]',
      [
        {
          kind: 'link',
          target: 'https://example.org/a?b=1',
          text: '[https://example.org/a?b=1 the site]',
        },
        { kind: 'link', target: '//example.org', text: '[//example.org $1]' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    ['brackets that are not links', '[not a link] [[|empty target]] [mailto:x]', []],
    [
      'tags, by lowercase name',
      '<B>bold</B> <br/> <a href="x">$1</a>',
      [
        { kind: 'tag', name: 'b', text: '<B>' },
        { kind: 'tag', name: 'b', text: '</B>' },
        { kind: 'tag', name: 'br', text: '<br/>' },
        { kind: 'tag', name: 'a', text: '<a href="x">' },
        { kind: 'parameter', text: '$1' },
        { kind: 'tag', name: 'a', text: '</a>' },
      ],
    ],
    ['less-than that is not a tag', '1 < 2 and <3 and < b>', []],
    [
      'an unclosed template, keeping what is inside',
      '{{PLURAL:$1|one',
      [{ kind: 'parameter', text: '$1' }],
    ],
    ['an unclosed link', '[[Page|text', []],
    [
      'a tag that would end past its template: no tag',
      '{{PLURAL:$1|<b x}}>',
      [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1|<b x}}' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    ['an unclosed external link', '[https://example.org text', []],
    [
      'a link closing outside a template: neither crosses the other',
      '{{PLURAL:$1|[[a}}]]',
      [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1|[[a}}' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
    [
      'Hebrew text around the syntax',
      'יש {{PLURAL:$1|פריט|$1 פריטים}}',
      [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1|פריט|$1 פריטים}}' },
        { kind: 'parameter', text: '$1' },
        { kind: 'parameter', text: '$1' },
      ],
    ],
  ])('finds %s', (_name, text, expected) => {
    expect(kinds(text)).toEqual(expected);
  });

  it('gives UTF-16 offsets into the text', () => {
    const text = '🦁 $1 [[P|x]]';
    for (const token of scanBanana(text)) {
      expect(text.slice(token.start, token.end)).toBe(token.text);
    }
    expect(scanBanana(text).map((t) => [t.start, t.end])).toEqual([
      [3, 5],
      [6, 13],
    ]);
  });
});
