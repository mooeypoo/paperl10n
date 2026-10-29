// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { markdownLanguage } from './markdown-language.ts';
import {
  headingCount,
  sectionView,
  setSectionAnchors,
  showSections,
  spacersFor,
} from './section-alignment.ts';

describe('spacersFor', () => {
  const at = (a: number, b: number) => [a, b] as const;
  it.each([
    ['nothing to pair', [], [], [[], []]],
    ['pairs already level', [at(0, 0), at(100, 100)], [at(0, 0), at(10, 20)], [[], []]],
    [
      'the translation’s section starts lower: the source waits',
      [at(0, 0), at(100, 140)],
      [at(0, 0), at(10, 20)],
      [[{ position: 10, height: 40 }], []],
    ],
    [
      'the source’s starts lower: the translation waits',
      [at(0, 0), at(150, 100)],
      [at(0, 0), at(10, 20)],
      [[], [{ position: 20, height: 50 }]],
    ],
    [
      'earlier spacers push later sections down',
      [at(0, 0), at(100, 140), at(200, 300)],
      [at(0, 0), at(10, 20), at(30, 40)],
      // After 40 above the source's second section, its third starts at 240: 60 more.
      [
        [
          { position: 10, height: 40 },
          { position: 30, height: 60 },
        ],
        [],
      ],
    ],
    [
      'a pair missing a side is skipped',
      [null, at(100, 130)],
      [null, at(10, 20)],
      [[{ position: 10, height: 30 }], []],
    ],
    ['heights round to whole pixels', [at(0, 0.4)], [at(0, 0)], [[], []]],
  ])('%s', (_description, tops, positions, expected) => {
    expect(spacersFor(tops, positions)).toEqual(expected);
  });
});

describe('the section view in an editor', () => {
  let views: EditorView[] = [];
  afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
  });

  const editor = (text: string) => {
    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions: [markdownLanguage(false), sectionView] }),
      parent: document.body,
    });
    views.push(view);
    return view;
  };
  const marked = (view: EditorView) =>
    [...view.contentDOM.querySelectorAll('.cm-section-start')].map((line) => line.textContent);

  const text = 'Intro\n\n## A\n\na\n\n## B\n\nb\n';
  const starts = [0, text.indexOf('## A'), text.indexOf('## B')];

  it('marks where each section starts, except at the very top', () => {
    const view = editor(text);
    expect(marked(view)).toEqual([]);
    view.dispatch({ effects: [setSectionAnchors.of(starts), showSections.of(true)] });
    expect(marked(view)).toEqual(['## A', '## B']);
    view.dispatch({ effects: showSections.of(false) });
    expect(marked(view)).toEqual([]);
    view.dispatch({ effects: [setSectionAnchors.of(null), showSections.of(true)] });
    expect(marked(view)).toEqual([]);
  });

  it('keeps the starts following edits while the marks are hidden', () => {
    const view = editor(text);
    view.dispatch({ effects: setSectionAnchors.of(starts) });
    view.dispatch({ changes: { from: 0, insert: 'More intro.\n\n' } });
    view.dispatch({ effects: showSections.of(true) });
    expect(marked(view)).toEqual(['## A', '## B']);
  });

  it('keeps the marks on their lines as the text is edited, and drops deleted ones', () => {
    const view = editor(text);
    view.dispatch({
      effects: [setSectionAnchors.of([0, null, ...starts.slice(1)]), showSections.of(true)],
    });
    // Lines added right above a heading go to the section before it: the mark stays with it.
    view.dispatch({ changes: { from: starts[1] ?? 0, insert: 'More.\n\n' } });
    expect(marked(view)).toEqual(['## A', '## B']);
    // Deleting a whole section (its heading line too).
    const b = view.state.doc.toString().indexOf('## B');
    view.dispatch({ changes: { from: b, to: view.state.doc.length } });
    expect(marked(view)).toEqual(['## A']);
  });

  it('counts the top-level headings of a depth, as sections are split', () => {
    const view = editor(
      [
        '## One',
        '```\n## not a heading\n```',
        '- ## in a list',
        '> ## in a quote',
        ':::note',
        '## Inside a container',
        ':::',
        'Setext two\n---',
        '### Deeper',
        '# Higher',
      ].join('\n\n'),
    );
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    expect(headingCount(view.state, 2)).toBe(3);
    expect(headingCount(view.state, 3)).toBe(1);
    expect(headingCount(view.state, 1)).toBe(1);
  });
});
