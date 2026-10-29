// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownLanguage } from './markdown-language.ts';
import { linkPreviews } from './markdown-links.ts';

const stateOf = (text: string) => {
  const state = EditorState.create({ doc: text, extensions: [markdownLanguage(false)] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
};

const previewsOf = (text: string) => {
  const state = stateOf(text);
  const slice = (from: number, to: number) => state.doc.sliceString(from, to);
  return linkPreviews(state, 0, state.doc.length).map((link) => ({
    link: slice(link.from, link.to),
    text: slice(link.textFrom, link.textTo),
    url: link.url,
  }));
};

describe('linkPreviews', () => {
  it.each([
    [
      'an inline link in a right-to-left sentence',
      'ראו את [המדריך](https://example.org) כאן.\n',
      [{ link: '[המדריך](https://example.org)', text: 'המדריך', url: 'https://example.org' }],
    ],
    [
      'a link with a title',
      '[docs](./guide.md "המדריך")\n',
      [{ link: '[docs](./guide.md "המדריך")', text: 'docs', url: './guide.md' }],
    ],
    [
      'a link to a destination in angle brackets',
      '[קובץ](<./my file.md>)\n',
      [{ link: '[קובץ](<./my file.md>)', text: 'קובץ', url: './my file.md' }],
    ],
    [
      'a link with markup in its text',
      '[**חשוב** `x`](/a)\n',
      [{ link: '[**חשוב** `x`](/a)', text: '**חשוב** `x`', url: '/a' }],
    ],
    [
      'two links on a line',
      '[א](/a) ו[ב](/b)\n',
      [
        { link: '[א](/a)', text: 'א', url: '/a' },
        { link: '[ב](/b)', text: 'ב', url: '/b' },
      ],
    ],
    ['a reference link', '[טקסט][ref]\n\n[ref]: /a\n', []],
    ['a shortcut reference', '[טקסט]\n', []],
    ['an autolink', '<https://example.org>\n', []],
    ['an image', '![תמונה](/a.png)\n', []],
    ['inline code that looks like a link', '`[a](/b)`\n', []],
    ['a link in a code block', '```\n[a](/b)\n```\n', []],
    ['an unclosed link', '[a](/b\n', []],
  ])('finds %s', (_description, text, expected) => {
    expect(previewsOf(text)).toEqual(expected);
  });

  it('finds a link around an image by its own brackets', () => {
    expect(previewsOf('[![לוגו](/l.png)](/home)\n')).toEqual([
      { link: '[![לוגו](/l.png)](/home)', text: '![לוגו](/l.png)', url: '/home' },
    ]);
  });
});
