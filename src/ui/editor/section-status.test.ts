// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { markdownLanguage } from './markdown-language.ts';
import { sectionView, setSectionAnchors, showSections } from './section-alignment.ts';
import {
  sectionStatus,
  setSectionBars,
  type SectionBar,
  type SectionBars,
} from './section-status.ts';

describe('section status bars in an editor', () => {
  let views: EditorView[] = [];
  afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
  });

  const text = 'Intro\n\n## A\n\na\n\n## B\n\nb\n';
  const starts = [0, text.indexOf('## A'), text.indexOf('## B')];
  const editor = () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [markdownLanguage(false), sectionView, sectionStatus],
      }),
      parent: document.body,
    });
    views.push(view);
    view.dispatch({ effects: [setSectionAnchors.of(starts), showSections.of(true)] });
    return view;
  };
  const bar = (status: SectionBar['status'], busy = false): SectionBar => ({
    status,
    statusLabel: status,
    mark: status === 'translated' ? null : { label: 'Mark', name: `Mark ${status}` },
    busy,
  });
  const marked: number[] = [];
  const bars = (list: (SectionBar | null)[]): SectionBars => ({
    bars: list,
    onMark: (index) => marked.push(index),
    lang: 'en',
    dir: 'ltr',
  });
  /** Each bar as its status and button, with the line after it. */
  const shown = (view: EditorView) =>
    [...view.contentDOM.querySelectorAll<HTMLElement>('.cm-section-bar')].map((element) => [
      element.dataset.status,
      element.querySelector('button')?.getAttribute('aria-label') ?? null,
      element.nextElementSibling?.textContent,
    ]);

  it('shows a bar above each section with one, with its button while it isn’t up to date', () => {
    const view = editor();
    view.dispatch({
      effects: setSectionBars.of(bars([bar('draft'), null, bar('translated')])),
    });
    expect(shown(view)).toEqual([
      ['draft', 'Mark draft', 'Intro'],
      ['translated', null, '## B'],
    ]);
    const element = view.contentDOM.querySelector<HTMLElement>('.cm-section-bar');
    expect([element?.lang, element?.dir, element?.contentEditable]).toEqual(['en', 'ltr', 'false']);
  });

  it('marks the section of its pair when its button is clicked, unless a mark is on its way', () => {
    const view = editor();
    marked.length = 0;
    view.dispatch({
      effects: setSectionBars.of(bars([null, bar('outdated'), bar('draft', true)])),
    });
    const buttons = [...view.contentDOM.querySelectorAll('button')];
    buttons[0]?.click();
    buttons[1]?.click();
    expect(marked).toEqual([1]);
    expect(buttons.map((button) => button.disabled)).toEqual([false, true]);
  });

  it('shows the bars in the section view only', () => {
    const view = editor();
    view.dispatch({ effects: setSectionBars.of(bars([bar('draft'), bar('draft'), bar('draft')])) });
    view.dispatch({ effects: showSections.of(false) });
    expect(shown(view)).toEqual([]);
    view.dispatch({ effects: [showSections.of(true), setSectionBars.of(null)] });
    expect(shown(view)).toEqual([]);
  });

  it('keeps each bar above its section as the text is edited, and drops a deleted one', () => {
    const view = editor();
    view.dispatch({ effects: setSectionBars.of(bars([null, bar('draft'), bar('outdated')])) });
    view.dispatch({ changes: { from: starts[1] ?? 0, insert: 'More.\n\n' } });
    expect(shown(view).map((row) => row[2])).toEqual(['## A', '## B']);
    const b = view.state.doc.toString().indexOf('## B');
    view.dispatch({ changes: { from: b, to: view.state.doc.length } });
    expect(shown(view).map((row) => row[0])).toEqual(['draft']);
  });

  it('shows one bar on a line two sections were joined onto', () => {
    const view = editor();
    view.dispatch({ effects: setSectionBars.of(bars([null, bar('draft'), bar('outdated')])) });
    // Delete what's between the two headings: `## A## B`, one line.
    const a = text.indexOf('## A') + '## A'.length;
    view.dispatch({ changes: { from: a, to: text.indexOf('## B') } });
    expect(shown(view)).toEqual([['draft', 'Mark draft', '## A## B']]);
  });
});
