// SPDX-License-Identifier: GPL-3.0-or-later
// Status through the whole UI (mountApp) with a fake client: the page list's statuses and
// progress, the one-time offer to mark existing translations, and marking the open page.
import type {
  DocumentPairDto,
  DocumentStatusDto,
  PaperLionApi,
  SourceDocumentDto,
  SourceDocumentListDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { error, fakeClient, pairFor, summary } from './test-support';

let unmount: (() => void) | undefined;
beforeEach(() => {
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** A page whose source hasn't changed since it was marked (or never was). */
const noChanges = { blocks: [], removals: [] } as const;

const entry = (key: string, status: SourceDocumentDto['status']): SourceDocumentDto => ({
  key,
  sourcePath: `en/${key}.md`,
  targetPath: `he/${key}.md`,
  targetExists: status !== 'missing',
  hasDraft: false,
  status,
});
const pages = [
  entry('about', 'translated'),
  entry('guide', 'outdated'),
  entry('index', 'draft'),
  entry('new', 'missing'),
];
const recorded: SourceDocumentListDto['statusFile'] = { exists: true, problem: null };
const unrecorded: SourceDocumentListDto['statusFile'] = { exists: false, problem: null };
const list = (
  documents: readonly SourceDocumentDto[],
  statusFile = recorded,
): { ok: true; value: SourceDocumentListDto } => ({
  ok: true,
  value: { documents, statusFile },
});
/** The index page: a draft, with three sections, one of them up to date. */
const indexPair: DocumentPairDto = {
  ...pairFor('index', 'Source\n', 'תרגום\n'),
  status: {
    page: 'draft',
    sections: ['translated', 'draft', 'draft'],
    changes: noChanges,
    sourceFingerprint: 'fp',
  },
};

type Answers = Parameters<typeof fakeClient>[0];
async function opened(answers: Answers = {}, overrides: Partial<PaperLionApi> = {}) {
  const fake = fakeClient({
    open: [{ ok: true, value: summary }],
    list: [list(pages)],
    read: { index: { ok: true, value: indexPair } },
    ...answers,
  });
  const { calls } = fake;
  const client = { ...fake.client, ...overrides };
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
  return { element, calls };
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
const pageButton = (element: Element, key: string) => {
  const found = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === key,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no page "${key}"`);
  return found;
};
const listed = (element: Element) =>
  [...element.querySelectorAll('nav li button')].map((item) => [
    item.querySelector('bdi')?.textContent,
    item.querySelector('.pages-status')?.getAttribute('data-status'),
    item.querySelector('.visually-hidden')?.textContent.trim(),
  ]);
const navText = (element: Element) => element.querySelector('nav')?.textContent ?? '';
/** The page header's status line, part by part. */
const header = (element: Element) => {
  const line = element.querySelector('.document-status');
  return line === null
    ? null
    : [...line.children].map((part) => part.textContent.trim()).join(' | ');
};
async function openPage(element: Element, key: string) {
  pageButton(element, key).click();
  await flushPromises();
}

describe('status in the page list', () => {
  it('shows each page’s status, and how many are up to date and outdated', async () => {
    const { element } = await opened();
    expect(listed(element)).toEqual([
      ['about', 'translated', 'Up to date'],
      ['guide', 'outdated', 'Outdated: the source changed since'],
      ['index', 'draft', 'Draft: never marked up to date'],
      ['new', 'missing', 'Not translated yet'],
    ]);
    expect(navText(element)).toContain('Up to date: 1 of 4');
    expect(navText(element)).toContain('One page is outdated');
  });

  it('says nothing about outdated pages when there are none', async () => {
    const { element } = await opened({ list: [list([entry('about', 'translated')])] });
    expect(navText(element)).not.toContain('outdated');
  });

  it('says why the status file can’t be read', async () => {
    const problem = error('workspace.status-invalid', { file: '.paperl10n/status/he.json' }, [
      'not valid JSON: Unexpected token',
    ]);
    const { element } = await opened({
      // A file that can't be read lists as not existing, with the reason.
      list: [list(pages, { exists: false, problem })],
    });
    const alert = element.querySelector('main .app-warnings[role="alert"]');
    expect(alert?.textContent).toContain("The status file .paperl10n/status/he.json isn't valid");
    expect(alert?.querySelector('li')?.textContent.trim()).toBe('not valid JSON: Unexpected token');
    // Not offered while the file is broken: marking would be refused.
    expect(findButton(element, 'Mark all up to date')).toBeUndefined();
  });
});

describe('marking existing translations up to date', () => {
  const before = [entry('about', 'draft'), entry('index', 'draft'), entry('new', 'missing')];
  const after = [
    entry('about', 'translated'),
    entry('index', 'translated'),
    entry('new', 'missing'),
  ];

  it('offers it once for a language never marked, and lists the pages again after', async () => {
    const { element, calls } = await opened({
      list: [list(before, unrecorded), list(after)],
      markExisting: { ok: true, value: { marked: ['about', 'index'] } },
    });
    await openPage(element, 'index');
    expect(navText(element)).toContain(
      '2 pages have translations that were never marked up to date.',
    );
    button(element, 'Mark all up to date').click();
    await flushPromises();
    expect(calls).toContain('markExistingUpToDate:p-1');
    expect(calls.at(-1)).toBe('listSourceDocuments:p-1');
    expect(listed(element).map(([key, status]) => [key, status])).toEqual([
      ['about', 'translated'],
      ['index', 'translated'],
      ['new', 'missing'],
    ]);
    expect(element.querySelector('nav [role="status"]')?.textContent.trim()).toBe(
      '2 pages marked up to date.',
    );
    expect(findButton(element, 'Mark all up to date')).toBeUndefined();
    // The open page was one of them: its header says so, without reading it again.
    expect(header(element)).toBe('Up to date | Sections up to date: 3 of 3');
    expect(calls.filter((call) => call.startsWith('readDocumentPair:p-1:index'))).toHaveLength(1);
  });

  it('can be put off until the project is opened again', async () => {
    const { element } = await opened({ list: [list(before, unrecorded)] });
    button(element, 'Not now').click();
    await flushPromises();
    expect(findButton(element, 'Mark all up to date')).toBeUndefined();
  });

  it('isn’t offered once a status file exists, or without translations', async () => {
    const recordedAlready = await opened({ list: [list(before)] });
    expect(findButton(recordedAlready.element, 'Mark all up to date')).toBeUndefined();
    unmount?.();
    document.body.innerHTML = '';
    const nothingYet = await opened({ list: [list([entry('new', 'missing')], unrecorded)] });
    expect(findButton(nothingYet.element, 'Mark all up to date')).toBeUndefined();
  });

  it('says why it failed, and keeps offering it', async () => {
    const failure = error('workspace.status-unwritable', {
      file: '.paperl10n/status/he.json',
      problem: 'files.unwritable',
    });
    const { element } = await opened({
      list: [list(before, unrecorded)],
      markExisting: { ok: false, error: failure },
    });
    button(element, 'Mark all up to date').click();
    await flushPromises();
    expect(element.querySelector('nav [role="alert"]')?.textContent.trim()).toBe(
      "The status file .paperl10n/status/he.json can't be saved (files.unwritable), so nothing was marked up to date.",
    );
    expect(button(element, 'Mark all up to date').disabled).toBe(false);
  });
});

describe('marking the open page up to date', () => {
  it('shows the page’s status and section progress, and marks the page', async () => {
    const { element, calls } = await opened({
      mark: {
        ok: true,
        value: {
          page: 'translated',
          sections: ['translated', 'translated', 'translated'],
          changes: noChanges,
        },
      },
    });
    await openPage(element, 'index');
    expect(header(element)).toBe(
      'Draft: never marked up to date | Sections up to date: 1 of 3 | Mark page up to date',
    );
    button(element, 'Mark page up to date').click();
    await flushPromises();
    expect(calls.at(-1)).toBe('markUpToDate:p-1:index:fp:page');
    expect(header(element)).toBe('Up to date | Sections up to date: 3 of 3');
    expect(listed(element)[2]?.[1]).toBe('translated');
    expect(navText(element)).toContain('Up to date: 2 of 4');
  });

  it('stops offering to mark existing translations once a page is marked', async () => {
    const { element } = await opened({ list: [list(pages, unrecorded)] });
    await openPage(element, 'index');
    expect(findButton(element, 'Mark all up to date')).toBeDefined();
    button(element, 'Mark page up to date').click();
    await flushPromises();
    expect(findButton(element, 'Mark all up to date')).toBeUndefined();
  });

  it('keeps an up-to-date page up to date when its translation is saved', async () => {
    const upToDate: DocumentPairDto = {
      ...indexPair,
      status: {
        page: 'translated',
        sections: ['translated'],
        changes: noChanges,
        sourceFingerprint: 'fp',
      },
    };
    const { element, calls } = await opened({ read: { index: { ok: true, value: upToDate } } });
    await openPage(element, 'index');
    const content = element
      .querySelectorAll('section[lang]')[1]
      ?.querySelector('.markdown-editor')
      ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
    const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
    view?.dispatch({ changes: { from: 0, insert: 'עוד ' } });
    await flushPromises();
    // The translation pane's Save (the unsaved-changes dialog has one too).
    const panes = element.querySelectorAll('section[lang]');
    button(panes[1] ?? element, 'Save').click();
    await flushPromises();
    expect(calls.at(-1)).toBe('saveDocument:p-1:index:"עוד תרגום\\n":"תרגום\\n"');
    expect(header(element)).toBe('Up to date');
  });

  it('shows no status for a page without a translation', async () => {
    const { element } = await opened();
    await openPage(element, 'new');
    expect(header(element)).toBeNull();
  });

  it('says when the source changed on disk, and reopens the page on request', async () => {
    const { element, calls } = await opened({
      mark: { ok: false, error: error('workspace.source-changed', { file: 'en/index.md' }) },
    });
    await openPage(element, 'index');
    button(element, 'Mark page up to date').click();
    await flushPromises();
    const alert = element.querySelector('.document-top [role="alert"]');
    expect(alert?.textContent).toContain(
      "The source en/index.md changed on disk since this page opened, so it wasn't marked up to date.",
    );
    expect(header(element)).toContain('Draft: never marked up to date');
    button(element, 'Reopen the page').click();
    await flushPromises();
    expect(calls.filter((call) => call === 'readDocumentPair:p-1:index')).toHaveLength(2);
    expect(element.querySelector('.document-top [role="alert"]')).toBeNull();
  });

  it('asks about unsaved changes before reopening the page', async () => {
    const { element, calls } = await opened({
      mark: { ok: false, error: error('workspace.source-changed', { file: 'en/index.md' }) },
    });
    await openPage(element, 'index');
    const content = element
      .querySelectorAll('section[lang]')[1]
      ?.querySelector('.markdown-editor')
      ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
    const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
    view?.dispatch({ changes: { from: 0, insert: 'עוד ' } });
    await flushPromises();
    button(element, 'Mark page up to date').click();
    await flushPromises();
    button(element, 'Reopen the page').click();
    await flushPromises();
    expect(document.querySelector<HTMLDialogElement>('dialog.unsaved')?.open).toBe(true);
    expect(calls.filter((call) => call === 'readDocumentPair:p-1:index')).toHaveLength(1);
  });
});

describe('marking a section up to date, in the section view', () => {
  // The translation has an intro the source lacks: that pair has no source section, so the
  // sections' indices count the source's only.
  const source = '## A\n\na\n\n## B\n\nb\n';
  const translation = 'מבוא\n\n## א\n\nא\n\n## ב\n\nב\n';
  const range = (text: string, from: string, to?: string) => ({
    start: text.indexOf(from),
    end: to === undefined ? text.length : text.indexOf(to),
  });
  const sectioned: DocumentPairDto = {
    ...pairFor('index', source, translation),
    sections: {
      paired: true,
      level: 2,
      pairs: [
        { kind: 'intro', source: null, target: range(translation, 'מבוא', '## א') },
        {
          kind: 'heading',
          source: range(source, '## A', '## B'),
          target: range(translation, '## א', '## ב'),
        },
        { kind: 'heading', source: range(source, '## B'), target: range(translation, '## ב') },
      ],
    },
    status: {
      page: 'outdated',
      sections: ['translated', 'outdated'],
      changes: noChanges,
      sourceFingerprint: 'fp',
    },
  };
  const bars = (element: Element) =>
    [
      ...(element
        .querySelectorAll('section[lang]')[1]
        ?.querySelector('.markdown-editor')
        ?.shadowRoot?.querySelectorAll<HTMLElement>('.cm-section-bar') ?? []),
    ].map((bar) => [
      bar.textContent.trim(),
      bar.querySelector('button')?.getAttribute('aria-label') ?? null,
      bar.nextElementSibling?.textContent,
    ]);

  it('shows each section’s status at its heading, and marks one', async () => {
    const { element, calls } = await opened({
      read: { index: { ok: true, value: sectioned } },
      mark: {
        ok: true,
        value: { page: 'translated', sections: ['translated', 'translated'], changes: noChanges },
      },
    });
    await openPage(element, 'index');
    expect(bars(element)).toEqual([
      // The heading under each bar (its `##` hidden by the live preview).
      ['Up to date', null, 'א'],
      ['Outdated: the source changed sinceMark up to date', 'Mark section 2 of 2 up to date', 'ב'],
    ]);
    const content = element
      .querySelectorAll('section[lang]')[1]
      ?.querySelector('.markdown-editor')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('.cm-section-bar button');
    content?.click();
    await flushPromises();
    expect(calls.at(-1)).toBe('markUpToDate:p-1:index:fp:1');
    expect(bars(element).map(([text]) => text)).toEqual(['Up to date', 'Up to date']);
    expect(header(element)).toBe('Up to date | Sections up to date: 2 of 2');
  });

  it('makes every section’s button wait while a mark is on its way', async () => {
    let finish: (value: Result<DocumentStatusDto, never>) => void = () => undefined;
    const { element } = await opened(
      { read: { index: { ok: true, value: sectioned } } },
      { markUpToDate: () => new Promise((resolve) => (finish = resolve)) },
    );
    await openPage(element, 'index');
    const buttons = () => [
      ...(element
        .querySelectorAll('section[lang]')[1]
        ?.querySelector('.markdown-editor')
        ?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.cm-section-bar button') ?? []),
    ];
    buttons()[0]?.click();
    await flushPromises();
    expect(buttons().map((item) => item.disabled)).toEqual([true]);
    expect(button(element, 'Mark page up to date').disabled).toBe(true);
    finish({
      ok: true,
      value: { page: 'outdated', sections: ['translated', 'outdated'], changes: noChanges },
    });
    await flushPromises();
    expect(buttons().map((item) => item.disabled)).toEqual([false]);
  });

  it('shows no bars in the full-page view', async () => {
    const { element } = await opened({ read: { index: { ok: true, value: sectioned } } });
    await openPage(element, 'index');
    button(element, 'Full page').click();
    await flushPromises();
    expect(bars(element)).toEqual([]);
  });

  it('shows no bars before the translation has a file', async () => {
    const { element } = await opened({
      read: {
        index: {
          ok: true,
          value: { ...sectioned, status: { ...sectioned.status, page: 'missing' } },
        },
      },
    });
    await openPage(element, 'index');
    expect(bars(element)).toEqual([]);
  });
});

describe('what changed in the source, in the source pane', () => {
  // A file with a BOM and CRLF line endings: main's offsets are into the file as read.
  const source = '\ufeff## A\r\n\r\na\r\n\r\n## B\r\n\r\nb2\r\n';
  const translation = '## א\n\nא\n\n## ב\n\nב\n';
  const offset = (text: string, part: string) => text.indexOf(part);
  const changed: DocumentPairDto = {
    ...pairFor('index', source, translation),
    sections: {
      paired: true,
      level: 2,
      pairs: [
        {
          kind: 'heading',
          source: { start: offset(source, '## A'), end: offset(source, '## B') },
          target: { start: 0, end: offset(translation, '## ב') },
        },
        {
          kind: 'heading',
          source: { start: offset(source, '## B'), end: source.length },
          target: { start: offset(translation, '## ב'), end: translation.length },
        },
      ],
    },
    status: {
      page: 'outdated',
      sections: ['draft', 'outdated'],
      changes: {
        blocks: [
          {
            kind: 'changed',
            range: { start: offset(source, 'b2'), end: offset(source, 'b2') + 2 },
          },
        ],
        removals: [{ offset: offset(source, 'b2') + 2, side: 'after' }],
      },
      sourceFingerprint: 'fp',
    },
  };
  const sourceEditor = (element: Element) =>
    element.querySelectorAll('section[lang]')[0]?.querySelector('.markdown-editor')?.shadowRoot;
  /** The source pane's lines with a mark, its removal markers, and its section bars. */
  const marked = (element: Element) =>
    [
      ...(sourceEditor(element)?.querySelectorAll<HTMLElement>(
        '.cm-source-change, .cm-source-removed, .cm-section-bar',
      ) ?? []),
    ].map((part) =>
      part.classList.contains('cm-source-change')
        ? `${part.dataset.change ?? ''}: ${part.textContent}`
        : `${part.className.replace(/^cm-/, '').split(' ')[0] ?? ''}: ${part.textContent.trim()}`,
    );

  it('marks the changes where they are, with a bar at each changed section’s heading', async () => {
    const { element } = await opened({ read: { index: { ok: true, value: changed } } });
    await openPage(element, 'index');
    expect(marked(element)).toEqual([
      'section-bar: Changed since marked up to date',
      'changed: b2',
      'source-removed: Text removed here',
    ]);
    // The bar is above section B's heading (section A, never marked, has none).
    const bar = sourceEditor(element)?.querySelector('.cm-section-bar');
    expect(bar?.nextElementSibling?.textContent).toBe('B');
    expect(header(element)).toBe(
      'Outdated: the source changed since | Sections up to date: 0 of 2 | ' +
        "The source's changes since it was marked up to date are highlighted. | " +
        'Mark page up to date',
    );
  });

  it('keeps the changes in the full page, without the section bars', async () => {
    const { element } = await opened({ read: { index: { ok: true, value: changed } } });
    await openPage(element, 'index');
    button(element, 'Full page').click();
    await flushPromises();
    expect(marked(element)).toEqual(['changed: b2', 'source-removed: Text removed here']);
  });

  it('clears them once the page is marked up to date', async () => {
    const { element } = await opened({
      read: { index: { ok: true, value: changed } },
      mark: {
        ok: true,
        value: { page: 'translated', sections: ['translated', 'translated'], changes: noChanges },
      },
    });
    await openPage(element, 'index');
    button(element, 'Mark page up to date').click();
    await flushPromises();
    expect(marked(element)).toEqual([]);
    expect(header(element)).toBe('Up to date | Sections up to date: 2 of 2');
  });

  it('shows nothing for a page without changes', async () => {
    const { element } = await opened();
    await openPage(element, 'index');
    expect(marked(element)).toEqual([]);
    expect(element.querySelector('.document-changes-note')).toBeNull();
  });
});
