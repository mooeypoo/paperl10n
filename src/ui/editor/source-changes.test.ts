// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { setSourceChanges, sourceChanges, type SourceChangeMarks } from './source-changes.ts';

describe('source changes in an editor', () => {
  let views: EditorView[] = [];
  afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
  });

  const text = '# Title\n\nOne line.\n\nTwo\nlines.\n\nLast.\n';
  const at = (part: string) => ({ from: text.indexOf(part), to: text.indexOf(part) + part.length });
  const editor = (marks: SourceChangeMarks | null) => {
    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions: [sourceChanges] }),
      parent: document.body,
    });
    views.push(view);
    view.dispatch({ effects: setSourceChanges.of(marks) });
    return view;
  };
  const marks = (overrides: Partial<SourceChangeMarks>): SourceChangeMarks => ({
    blocks: [],
    removals: [],
    removedLabel: 'Text removed here',
    lang: 'en',
    dir: 'ltr',
    ...overrides,
  });
  /** The editor's content, line by line: each line's text and mark, and each removal marker. */
  const shown = (view: EditorView) =>
    [...view.contentDOM.children].map((element) =>
      element instanceof HTMLElement && element.classList.contains('cm-source-removed')
        ? `removed (${element.lang}, ${element.dir}): ${element.textContent}`
        : `${element.textContent}${element instanceof HTMLElement && element.dataset.change !== undefined ? ` [${element.dataset.change}]` : ''}`,
    );

  it('marks every line of each changed or new block, with its kind', () => {
    const view = editor(
      marks({
        blocks: [
          { kind: 'changed', ...at('One line.') },
          { kind: 'added', ...at('Two\nlines.') },
        ],
      }),
    );
    expect(shown(view)).toEqual([
      '# Title',
      '',
      'One line. [changed]',
      '',
      'Two [added]',
      'lines. [added]',
      '',
      'Last.',
      '',
    ]);
  });

  it('puts a removal before a block, or after one, in the interface’s language', () => {
    const view = editor(
      marks({
        removals: [
          { at: at('Two').from, side: 'before' },
          { at: at('Last.').to, side: 'after' },
        ],
        lang: 'he',
        dir: 'rtl',
        removedLabel: 'כאן הוסר טקסט',
      }),
    );
    expect(shown(view)).toEqual([
      '# Title',
      '',
      'One line.',
      '',
      'removed (he, rtl): כאן הוסר טקסט',
      'Two',
      'lines.',
      '',
      'Last.',
      'removed (he, rtl): כאן הוסר טקסט',
      '',
    ]);
    // Not part of the text: it can't be edited, and the editor leaves its events alone.
    const marker = view.contentDOM.querySelector<HTMLElement>('.cm-source-removed');
    expect(marker?.contentEditable).toBe('false');
  });

  it('clears the marks when the changes are gone (marked up to date)', () => {
    const view = editor(
      marks({
        blocks: [{ kind: 'changed', ...at('Last.') }],
        removals: [{ at: 0, side: 'before' }],
      }),
    );
    expect(view.contentDOM.querySelectorAll('.cm-source-change, .cm-source-removed')).toHaveLength(
      2,
    );
    view.dispatch({ effects: setSourceChanges.of(null) });
    expect(view.contentDOM.querySelectorAll('.cm-source-change, .cm-source-removed')).toHaveLength(
      0,
    );
  });
});
