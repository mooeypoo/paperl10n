// SPDX-License-Identifier: GPL-3.0-or-later
// Preservation hints and the length note (docs/domains/translation.md), through the whole UI with
// a fake client: what's asked for as the translation changes, and where the answers show.
import type {
  DocumentPairDto,
  ErrorDto,
  PaperLionApi,
  SectionPairingDto,
  TranslationCheckDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, fakeClient, pairFor, summary } from './test-support';

const source = 'Intro.\n\n## Install\n\nRun [it](/run/).\n\n## Use\n\nUse it.\n';
const translation = 'מבוא.\n\n## התקנה\n\nמריצים.\n\n## שימוש\n\nמשתמשים.\n';

const startsIn = (text: string) => [0, ...[...text.matchAll(/^## /gm)].map((match) => match.index)];
const range = (text: string, start: number | undefined) =>
  start === undefined
    ? null
    : { start, end: startsIn(text).find((next) => next > start) ?? text.length };
function paired(target: string): SectionPairingDto {
  const targetStarts = startsIn(target);
  return {
    paired: true,
    level: 2,
    pairs: startsIn(source).map((start, index) => ({
      kind: index === 0 ? 'intro' : 'heading',
      source: range(source, start),
      target: range(target, targetStarts[index]),
    })),
  };
}

/** The index page, translated, with status (so its sections have bars). */
const indexPair: DocumentPairDto = {
  ...pairFor('index', source, translation),
  sections: paired(translation),
  status: {
    page: 'draft',
    sections: ['draft', 'draft', 'draft'],
    changes: { blocks: [], removals: [] },
    sourceFingerprint: 'fp',
  },
};

const missingLink = { kind: 'link' as const, missing: ['/run/'], extra: [] };
/** A check: the link in the Install section is missing, and the translation is 80% as long. */
const withHint: TranslationCheckDto = {
  page: [missingLink],
  sections: [[], [missingLink], []],
  length: { source: 50, translation: 41 },
};

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

type Check = PaperLionApi['checkTranslation'];
async function opened(
  checkTranslation: Check,
  pair: DocumentPairDto = indexPair,
): Promise<{ element: HTMLElement; asked: string[] }> {
  const { client } = fakeClient({
    open: [{ ok: true, value: summary }],
    list: [{ ok: true, value: documents }],
    read: { index: { ok: true, value: pair } },
  });
  const asked: string[] = [];
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(
    element,
    {
      ...client,
      checkTranslation: (request) => {
        asked.push(request.text);
        return checkTranslation(request);
      },
    },
    { preferences: memoryPreferences(), systemLanguages: ['en-US'] },
  );
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
  await vi.advanceTimersByTimeAsync(0);
  return { element, asked };
}
const answer =
  (check: TranslationCheckDto): Check =>
  () =>
    Promise.resolve({ ok: true, value: check });

function button(element: Element, text: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
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
/** Each translation section bar's hints (the first line's bar sits above the editor). */
const barHints = (element: Element) =>
  [
    ...(pane(element, 1)
      ?.querySelector('.markdown-editor')
      ?.shadowRoot?.querySelectorAll<HTMLElement>('.cm-section-bar') ?? []),
  ].map((bar) => [...bar.querySelectorAll('.cm-section-bar-hints li')].map((li) => li.textContent));
/** The page's hints, above the translation. */
const pageHints = (element: Element) =>
  [...(pane(element, 1)?.querySelectorAll('.document-hints li') ?? [])].map(
    (item) => item.textContent,
  );
const lengthNote = (element: Element) =>
  pane(element, 1)?.querySelector('.document-length')?.textContent ?? null;

const install = '⁨/run/⁩';

describe('preservation hints and the length note', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('checks the translation when the page opens, and shows each section’s hints at its bar', async () => {
    const { element, asked } = await opened(answer(withHint));
    expect(asked).toEqual([translation]);
    expect(barHints(element)).toEqual([[], [`A link only in the source: ${install}`], []]);
    // Shown at the section, so not again for the page.
    expect(pageHints(element)).toEqual([]);
    expect(lengthNote(element)).toBe("About 80% of the source's length");
  });

  it('shows the page’s hints in the full page instead', async () => {
    const { element } = await opened(answer(withHint));
    button(element, 'Full page').click();
    await flushPromises();
    expect(barHints(element)).toEqual([]);
    expect(pageHints(element)).toEqual([`A link only in the source: ${install}`]);
    expect(pane(element, 1)?.querySelector('.document-hints')?.textContent).toContain(
      'Usually kept as they are, and different from the source:',
    );
  });

  it('checks again once typing pauses, with the text as typed, and shows the new answer', async () => {
    let next: TranslationCheckDto = withHint;
    const { element, asked } = await opened(() => Promise.resolve({ ok: true, value: next }));
    const target = editorIn(element, 1);
    next = { page: [], sections: [[], [], []], length: { source: 50, translation: 50 } };
    target.dispatch({ changes: { from: 0, insert: 'א' } });
    target.dispatch({ changes: { from: 1, insert: 'ב' } });
    await vi.advanceTimersByTimeAsync(399);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toEqual([translation, `אב${translation}`]);
    expect(barHints(element)).toEqual([[], [], []]);
    expect(lengthNote(element)).toBe("About 100% of the source's length");
  });

  it('keeps only the newest answer when an older one comes back late', async () => {
    const answers: ((value: Result<TranslationCheckDto, ErrorDto>) => void)[] = [];
    const { element } = await opened(() => new Promise((resolve) => answers.push(resolve)));
    const target = editorIn(element, 1);
    target.dispatch({ changes: { from: 0, insert: 'א' } });
    await vi.advanceTimersByTimeAsync(400);
    // The newer check answers first; the one from opening comes back after it.
    answers[1]?.({ ok: true, value: { ...withHint, page: [], sections: [[], [], []] } });
    answers[0]?.({ ok: true, value: withHint });
    await flushPromises();
    expect(barHints(element)).toEqual([[], [], []]);
  });

  it('shows the page’s hints when the text no longer pairs as the page opened', async () => {
    const { element } = await opened(answer({ ...withHint, sections: null }));
    expect(barHints(element)).toEqual([[], [], []]);
    expect(pageHints(element)).toEqual([`A link only in the source: ${install}`]);
  });

  it('shows the page’s hints when the text’s pairs aren’t the ones the page opened with', async () => {
    // The text pairs, but into two pairs: the bars can't take them.
    const { element } = await opened(answer({ ...withHint, sections: [[], [missingLink]] }));
    expect(barHints(element)).toEqual([[], [], []]);
    expect(pageHints(element)).toEqual([`A link only in the source: ${install}`]);
  });

  it('shows the page’s hints once a new heading changes the sections', async () => {
    const { element } = await opened(answer(withHint));
    const target = editorIn(element, 1);
    target.dispatch({ changes: { from: target.state.doc.length, insert: '\n## חדש\n' } });
    await vi.advanceTimersByTimeAsync(400);
    expect(barHints(element)).toEqual([[], [], []]);
    expect(pageHints(element)).toEqual([`A link only in the source: ${install}`]);
  });

  it('checks the file’s text again after a restored draft is discarded', async () => {
    const draft = 'טיוטה.\n\n## התקנה\n\nמריצים.\n\n## שימוש\n\nמשתמשים.\n';
    const { element, asked } = await opened(answer(withHint), {
      ...indexPair,
      draft: { text: draft, base: translation },
    });
    expect(asked).toEqual([draft]);
    button(element, 'Discard them').click();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    expect(asked).toEqual([draft, translation]);
  });

  it('shows the page’s hints for a translation without a file yet (no section bars)', async () => {
    const { element, asked } = await opened(answer(withHint), pairFor('index', source));
    expect(asked).toEqual([]);
    button(element, 'Start translating').click();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    expect(asked).toEqual([source]);
    expect(pageHints(element)).toEqual([`A link only in the source: ${install}`]);
  });

  it('shows nothing when the check fails, or the source is empty', async () => {
    const failed = await opened(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'internal.unexpected', params: {}, details: [] },
      }),
    );
    expect(barHints(failed.element)).toEqual([[], [], []]);
    expect(lengthNote(failed.element)).toBeNull();
    unmount?.();
    document.body.innerHTML = '';

    const empty = await opened(answer({ ...withHint, length: { source: 0, translation: 3 } }));
    expect(lengthNote(empty.element)).toBeNull();
  });
});
