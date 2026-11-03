// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { PlaceholderTokenDto } from '#ipc-contract';
import { messagePreview, pluralSamples } from './message-preview';

/** A token over the first `piece` in `text` from `from` on, as main would find it. */
function token(
  text: string,
  kind: PlaceholderTokenDto['kind'],
  piece: string,
  from = 0,
): PlaceholderTokenDto {
  const start = text.indexOf(piece, from);
  if (start < 0) throw new Error(`"${piece}" isn't in "${text}"`);
  return { kind, start, end: start + piece.length };
}

const rowsOf = (preview: ReturnType<typeof messagePreview>) =>
  preview?.kind === 'rows' ? preview.rows : [];

describe('pluralSamples', () => {
  it.each([
    [
      'en',
      [
        ['one', 1],
        ['other', 2],
      ],
    ],
    [
      'he',
      [
        ['one', 1],
        ['two', 2],
        ['other', 3],
      ],
    ],
    ['ja', [['other', 1]]],
    [
      'fr',
      [
        ['one', 1],
        ['many', 1000000],
        ['other', 2],
      ],
    ],
    [
      'ar',
      [
        ['zero', 0],
        ['one', 1],
        ['two', 2],
        ['few', 3],
        ['many', 11],
        ['other', 100],
      ],
    ],
    [
      'ru',
      [
        ['one', 1],
        ['few', 2],
        ['many', 5],
        ['other', 0.5],
      ],
    ],
  ])('gives %s its categories in banana-i18n order, each with a number in it', (locale, want) => {
    expect(pluralSamples(locale).map(({ category, count }) => [category, count])).toEqual(want);
  });
});

describe('messagePreview', () => {
  it('has nothing to preview without a plural or gender', () => {
    const text = 'שלום $1, [[Page|קישור]]';
    expect(messagePreview('he', text, [token(text, 'parameter', '$1')])).toBeNull();
    expect(messagePreview('he', '', [])).toBeNull();
  });

  it('renders each plural form of the language, the parameter given each sample', () => {
    const text = 'יש {{PLURAL:$1|דף אחד|שני דפים|$1 דפים}}';
    const tokens = [
      token(text, 'plural', '{{PLURAL:$1|דף אחד|שני דפים|$1 דפים}}'),
      token(text, 'parameter', '$1'),
    ];
    expect(rowsOf(messagePreview('he', text, tokens))).toEqual([
      { kind: 'plural', category: 'one', count: 1, text: 'יש דף אחד' },
      { kind: 'plural', category: 'two', count: 2, text: 'יש שני דפים' },
      { kind: 'plural', category: 'other', count: 3, text: 'יש 3 דפים' },
    ]);
  });

  it('renders a gender for each of male, female, and unknown', () => {
    const text = '{{GENDER:$1|ערך|ערכה|ערך/ה}} את הדף';
    const tokens = [
      token(text, 'gender', '{{GENDER:$1|ערך|ערכה|ערך/ה}}'),
      token(text, 'parameter', '$1'),
    ];
    expect(rowsOf(messagePreview('he', text, tokens))).toEqual([
      { kind: 'gender', gender: 'male', text: 'ערך את הדף' },
      { kind: 'gender', gender: 'female', text: 'ערכה את הדף' },
      { kind: 'gender', gender: 'unknown', text: 'ערך/ה את הדף' },
    ]);
  });

  it('varies a gender without a parameter (the current user) too', () => {
    const text = '$1 {{GENDER:|edited|edited (f)|edited (n)}}';
    const tokens = [
      token(text, 'parameter', '$1'),
      token(text, 'gender', '{{GENDER:|edited|edited (f)|edited (n)}}'),
    ];
    expect(rowsOf(messagePreview('en', text, tokens)).map((row) => row.text)).toEqual([
      '$1 edited',
      '$1 edited (f)',
      '$1 edited (n)',
    ]);
  });

  it('gives plural rows the unknown gender, gender rows the "other" number, and keeps other parameters as written', () => {
    const text = '$3: {{GENDER:$1|he|she|they}} edited {{PLURAL:$2|a page|$2 pages}}';
    const tokens = [
      token(text, 'parameter', '$3'),
      token(text, 'gender', '{{GENDER:$1|he|she|they}}'),
      token(text, 'parameter', '$1'),
      token(text, 'plural', '{{PLURAL:$2|a page|$2 pages}}'),
      token(text, 'parameter', '$2', text.indexOf('PLURAL')),
      token(text, 'parameter', '$2', text.indexOf('|a page')),
    ];
    expect(rowsOf(messagePreview('en', text, tokens)).map((row) => row.text)).toEqual([
      '$3: they edited a page',
      '$3: they edited 2 pages',
      '$3: he edited 2 pages',
      '$3: she edited 2 pages',
      '$3: they edited 2 pages',
    ]);
  });

  it('uses an explicit form when a sample hits it', () => {
    const text = '{{PLURAL:$1|1=just one|$1 pages}}';
    const tokens = [token(text, 'plural', text)];
    expect(rowsOf(messagePreview('en', text, tokens)).map((row) => row.text)).toEqual([
      'just one',
      '2 pages',
    ]);
  });

  it('shows links and tags as their text, and escaped text as it reads', () => {
    const text =
      '{{PLURAL:$1|one|many}} <b>bold</b> [[Help:Pages|help]] [https://example.org site] &lt;';
    const tokens = [token(text, 'plural', '{{PLURAL:$1|one|many}}')];
    expect(rowsOf(messagePreview('en', text, tokens))[0]?.text).toBe('one bold help site <');
  });

  it("doesn't vary a choice whose parameter isn't $n", () => {
    const text = '{{PLURAL:{{NUMBER}}|one|many}}';
    expect(messagePreview('en', text, [token(text, 'plural', text)])).toBeNull();
  });

  it("says when banana-i18n can't read the text", () => {
    const text = '{{PLURAL:$1|a|b}} {{PLURAL:$1|';
    expect(messagePreview('en', text, [token(text, 'plural', '{{PLURAL:$1|a|b}}')])).toEqual({
      kind: 'unreadable',
    });
  });
});
