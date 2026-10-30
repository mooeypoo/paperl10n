// SPDX-License-Identifier: GPL-3.0-or-later
// Status through the whole UI (mountApp) with a fake client: the page list's statuses and
// progress, the one-time offer to mark existing translations, and marking the open page.
import type { DocumentPairDto, SourceDocumentDto, SourceDocumentListDto } from '#ipc-contract';
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
  status: { page: 'draft', sections: ['translated', 'draft', 'draft'], sourceFingerprint: 'fp' },
};

type Answers = Parameters<typeof fakeClient>[0];
async function opened(answers: Answers = {}) {
  const { client, calls } = fakeClient({
    open: [{ ok: true, value: summary }],
    list: [list(pages)],
    read: { index: { ok: true, value: indexPair } },
    ...answers,
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
        value: { page: 'translated', sections: ['translated', 'translated', 'translated'] },
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
      status: { page: 'translated', sections: ['translated'], sourceFingerprint: 'fp' },
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
