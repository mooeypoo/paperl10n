// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownLanguage } from './markdown-language.ts';
import { markedElements } from './markdown-marks.ts';

/** Each element as written, and what's left when its marks are hidden. */
const elementsOf = (text: string, mdx = false) => {
  const state = EditorState.create({ doc: text, extensions: [markdownLanguage(mdx)] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return markedElements(state, 0, state.doc.length).map((element) => {
    let shown = '';
    let at = element.from;
    for (const range of element.hidden) {
      shown += state.sliceDoc(at, range.from);
      at = range.to;
    }
    shown += state.sliceDoc(at, element.to);
    return [state.sliceDoc(element.from, element.to), shown];
  });
};

describe('markedElements', () => {
  it.each([
    ['emphasis', 'זה *חשוב* מאוד\n', [['*חשוב*', 'חשוב']]],
    ['emphasis with underscores', '_חשוב_\n', [['_חשוב_', 'חשוב']]],
    ['strong emphasis', '**חשוב**\n', [['**חשוב**', 'חשוב']]],
    [
      'strong inside emphasis',
      '*a **b** c*\n',
      [
        ['*a **b** c*', 'a **b** c'],
        ['**b**', 'b'],
      ],
    ],
    ['struck text', '~~ישן~~\n', [['~~ישן~~', 'ישן']]],
    ['inline code', 'הריצו `pnpm i` עכשיו\n', [['`pnpm i`', 'pnpm i']]],
    ['inline code with double backticks', '``a ` b``\n', [['``a ` b``', 'a ` b']]],
    ['an ATX heading', '## כותרת\n', [['## כותרת', 'כותרת']]],
    ['a heading with closing marks', '# כותרת ##\n', [['# כותרת ##', 'כותרת']]],
    ['a heading with extra spaces', '#   כותרת\n', [['#   כותרת', 'כותרת']]],
    [
      'a heading with markup inside',
      '# **a**\n',
      [
        ['# **a**', '**a**'],
        ['**a**', 'a'],
      ],
    ],
    ['an empty heading', '#\n', []],
    ['a Setext heading', 'כותרת\n===\n', []],
    ['escaped stars', '\\*לא\\*\n', []],
    ['a lone star', 'a * b\n', []],
    ['list markers and quotes', '- a\n> b\n', []],
    ['a fenced code block', '```\n**a** `b`\n```\n', []],
    ['frontmatter', '---\ntitle: "*a*"\n---\n', []],
    ['empty inline code', '`` ``\n', [['`` ``', ' ']]],
  ])('%s', (_description, text, expected) => {
    expect(elementsOf(text)).toEqual(expected);
  });

  it('finds marks in MDX text, not in its import lines', () => {
    expect(elementsOf("import A from './a';\n\n# **כותרת**\n", true)).toEqual([
      ['# **כותרת**', '**כותרת**'],
      ['**כותרת**', 'כותרת'],
    ]);
  });
});
