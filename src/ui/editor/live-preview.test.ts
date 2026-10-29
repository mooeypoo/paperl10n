// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { livePreview, revealed } from './live-preview.ts';
import { markdownLanguage } from './markdown-language.ts';

describe('revealed', () => {
  // An element from 4 to 14, as `[link](/a)` in 'abc [link](/a) def'.
  const element = { from: 4, to: 14 };

  it.each([
    ['a caret before it', [EditorSelection.cursor(2)], false],
    ['a caret at its start', [EditorSelection.cursor(4)], true],
    ['a caret in it', [EditorSelection.cursor(6)], true],
    ['a caret at its end', [EditorSelection.cursor(14)], true],
    ['a caret after it', [EditorSelection.cursor(16)], false],
    ['a selection across it', [EditorSelection.range(0, 18)], true],
    ['a selection ending at it', [EditorSelection.range(0, 4)], true],
    ['a selection elsewhere', [EditorSelection.range(15, 18)], false],
    ['one of several carets', [EditorSelection.cursor(0), EditorSelection.cursor(8)], true],
    ['no selection (an unfocused editor)', [], false],
  ])('%s: %s', (_description, ranges, expected) => {
    expect(revealed(element, ranges)).toBe(expected);
  });
});

describe('livePreview', () => {
  let views: EditorView[] = [];
  afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
  });

  it('shows an unfocused editor as prose: links, emphasis, code, and headings', () => {
    const text = '## כותרת\n\nראו **את** [המדריך](/a) ו-`pnpm i`.\n\n- רשימה\n';
    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions: [markdownLanguage(false), livePreview] }),
      parent: document.body,
    });
    ensureSyntaxTree(view.state, text.length, 5000);
    view.dispatch({}); // Rebuild with the whole tree.
    views.push(view);
    expect(
      [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.textContent),
    ).toEqual(['כותרת', '', 'ראו את המדריך ו-pnpm i.', '', '- רשימה', '']);
    expect(view.state.doc.toString()).toBe(text);
  });
});
