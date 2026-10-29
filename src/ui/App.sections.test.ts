// SPDX-License-Identifier: GPL-3.0-or-later
// The section view through the whole UI (mountApp) with a fake client: which view a page opens
// in, the toggle, and the notes. Lining the panes up needs a real layout: the E2E covers it.
import type { DocumentPairDto, SectionPairingDto } from '#ipc-contract';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, fakeClient, pairFor, summary } from './test-support';

const source = 'Intro.\n\n## Install\n\nRun it.\n\n## Use\n\nUse it.\n';
const translation = 'מבוא.\n\n## התקנה\n\nמריצים.\n\n## שימוש\n\nמשתמשים.\n';

/** Where each section starts in `text`: the intro, then each `## ` heading. */
const startsIn = (text: string) => [0, ...[...text.matchAll(/^## /gm)].map((match) => match.index)];
const range = (text: string, start: number | undefined) =>
  start === undefined
    ? null
    : { start, end: startsIn(text).find((next) => next > start) ?? text.length };

/** The pairing main makes for these texts (`translation`, or the source for a new one). */
function paired(target: string = source): SectionPairingDto {
  const sourceStarts = startsIn(source);
  const targetStarts = startsIn(target);
  return {
    paired: true,
    level: 2,
    pairs: sourceStarts.map((start, index) => ({
      kind: index === 0 ? 'intro' : 'heading',
      source: range(source, start),
      target: range(target, targetStarts[index]),
    })),
  };
}

let unmount: (() => void) | undefined;
beforeEach(() => {
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function opened(pair: DocumentPairDto) {
  const { client } = fakeClient({
    open: [{ ok: true, value: summary }],
    list: [{ ok: true, value: documents }],
    read: { index: { ok: true, value: pair } },
  });
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, client, {
    preferences: memoryPreferences(),
    systemLanguages: ['en-US'],
  });
  unmount = () => {
    app.unmount();
  };
  button(element, 'Open folder…').click();
  await flushPromises();
  const index = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === 'index',
  );
  if (!(index instanceof HTMLButtonElement)) throw new Error('no index page');
  index.click();
  await flushPromises();
  return element;
}

const findButton = (element: Element, text: string) =>
  [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
function button(element: Element, text: string): HTMLButtonElement {
  const found = findButton(element, text);
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

const pane = (element: Element, index: number) => element.querySelectorAll('section[lang]')[index];
function editorIn(element: Element, index: number): EditorView {
  const content = pane(element, index)
    ?.querySelector('.markdown-editor')
    ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
  const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
  if (view === null) throw new Error('no editor');
  return view;
}
/** The lines marked as a section's start, in each pane. */
const sectionStarts = (element: Element) =>
  [0, 1].map((index) =>
    [...editorIn(element, index).contentDOM.querySelectorAll('.cm-section-start')].map(
      (line) => line.textContent,
    ),
  );
const pressed = (element: Element) =>
  ['Sections', 'Full page'].map((name) => button(element, name).getAttribute('aria-pressed'));
const notes = (element: Element) =>
  [...element.querySelectorAll('.document-sections-note')].map((note) => note.textContent.trim());

describe('the section view', () => {
  it('opens a page whose sections pair section by section', async () => {
    const element = await opened({
      ...pairFor('index', source, translation),
      sections: paired(translation),
    });
    expect(pressed(element)).toEqual(['true', 'false']);
    expect(sectionStarts(element)).toEqual([
      ['Install', 'Use'],
      ['התקנה', 'שימוש'],
    ]);
    expect(notes(element)).toEqual([]);
  });

  it('finds the sections in files with a BOM and CRLF line endings', async () => {
    const crlf = (text: string) => `\uFEFF${text.replaceAll('\n', '\r\n')}`;
    // Short lines, so an offset that missed the BOM and the CRs would land lines later.
    const short = 'א\n\nב\n\nג\n\nד\n\n## התקנה\n\nה\n\nו\n\n## שימוש\n\nז\n';
    const file = crlf(short);
    const sections = paired(short);
    if (!sections.paired) throw new Error('test setup');
    // Main's offsets are into the file as read: after the BOM, two characters per line break.
    const inFile = (offset: number) => crlf(short.slice(0, offset)).length;
    const element = await opened({
      ...pairFor('index', source, file),
      sections: {
        ...sections,
        pairs: sections.pairs.map((pair) => ({
          ...pair,
          target:
            pair.target === null
              ? null
              : { start: inFile(pair.target.start), end: inFile(pair.target.end) },
        })),
      },
    });
    expect(sectionStarts(element)[1]).toEqual(['התקנה', 'שימוש']);
  });

  it('switches to the full page and back, keeping the text and its edits', async () => {
    const element = await opened({
      ...pairFor('index', source, translation),
      sections: paired(translation),
    });
    const target = editorIn(element, 1);
    target.dispatch({ changes: { from: 0, insert: 'עוד ' } });
    button(element, 'Full page').click();
    await flushPromises();
    expect(pressed(element)).toEqual(['false', 'true']);
    expect(sectionStarts(element)).toEqual([[], []]);
    button(element, 'Sections').click();
    await flushPromises();
    expect(sectionStarts(element)).toEqual([
      ['Install', 'Use'],
      ['התקנה', 'שימוש'],
    ]);
    expect(editorIn(element, 1).state.doc.toString()).toBe(`עוד ${translation}`);
  });

  it.each([
    [
      'a different number of sections',
      { paired: false, reason: 'count', sourceCount: 2, targetCount: 1 } as const,
      "This page shows in full: its sections don't line up with the source's (1 in the translation, 2 in the source). When they match, it opens section by section.",
    ],
    [
      'headings at another level',
      { paired: false, reason: 'level', sourceCount: 2, targetCount: 0 } as const,
      "This page shows in full: the translation's headings are at a different level from the source's. When they match, it opens section by section.",
    ],
  ])(
    'opens a page in full when its sections don’t pair: %s',
    async (_description, sections, note) => {
      const element = await opened({ ...pairFor('index', source, 'רק טקסט.\n'), sections });
      expect(pressed(element)).toEqual(['false', 'true']);
      expect(button(element, 'Sections').disabled).toBe(true);
      expect(sectionStarts(element)).toEqual([[], []]);
      expect(notes(element)).toEqual([note]);
    },
  );

  it('pairs a new translation with its copy of the source, once started', async () => {
    const element = await opened({ ...pairFor('index', source), sections: paired() });
    expect(findButton(element, 'Sections')).toBeUndefined();
    button(element, 'Start translating').click();
    await flushPromises();
    expect(pressed(element)).toEqual(['true', 'false']);
    expect(sectionStarts(element)).toEqual([
      ['Install', 'Use'],
      ['Install', 'Use'],
    ]);
  });

  it('stays as it opened when editing changes the sections, and says so', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const element = await opened({
      ...pairFor('index', source, translation),
      sections: paired(translation),
    });
    const target = editorIn(element, 1);
    target.dispatch({ changes: { from: target.state.doc.length, insert: '\n## חדש\n' } });
    await vi.advanceTimersByTimeAsync(300);
    expect(notes(element)).toEqual([
      "The sections have changed since this page opened. They'll be paired again when you reopen it.",
    ]);
    // The view and its marks stay.
    expect(pressed(element)).toEqual(['true', 'false']);
    expect(sectionStarts(element)[1]).toEqual(['התקנה', 'שימוש']);
    // Back to the same sections: the note goes.
    target.dispatch({
      changes: { from: translation.length, to: target.state.doc.length },
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(notes(element)).toEqual([]);
  });

  it('stops lining up when a restored draft is discarded, until the page is reopened', async () => {
    // Paired for the draft; discarding it shows the file, which the pairing wasn't made for.
    const element = await opened({
      ...pairFor('index', source, `${translation}x`),
      draft: { text: translation, base: `${translation}x` },
      sections: paired(translation),
    });
    expect(sectionStarts(element)[1]).toEqual(['התקנה', 'שימוש']);
    button(element, 'Discard them').click();
    await flushPromises();
    expect(sectionStarts(element)).toEqual([[], []]);
    expect(button(element, 'Sections').disabled).toBe(true);
    expect(notes(element)).toEqual([
      "The sections have changed since this page opened. They'll be paired again when you reopen it.",
    ]);
  });
});
