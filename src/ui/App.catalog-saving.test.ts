// SPDX-License-Identifier: GPL-3.0-or-later
// Saving a catalog (M4 C7c), through the real entry point with a fake client: the Save button and
// Ctrl/Cmd+S, the rows and the sidebar read again after a save, errors, "Keep as up to date", and
// the unsaved-changes question before leaving a catalog with edits.
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  CatalogSaveDto,
  ErrorDto,
  MessageSaveDto,
  PaperLionApi,
  SavedMessageDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, error, fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // happy-dom can't focus a CodeMirror editor (App.links.test.ts says why).
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const banana = { id: 'catalog-banana', displayName: 'banana-i18n' };
const message = (
  key: string,
  status: CatalogMessageDto['status'],
  translation: string | null,
): CatalogMessageDto => ({
  key,
  source: `Source of ${key}`,
  documentation: null,
  translation,
  status,
  sourceTokens: [],
  translationTokens: [],
});
const detail = (key: string, messages: CatalogMessageDto[]): CatalogDetailDto => ({
  key,
  sourcePath: `${key}/en.json`,
  targetPath: `${key}/he.json`,
  targetExists: true,
  documentationPath: null,
  messages,
  notInSource: [],
  documentationProblem: null,
  draft: null,
  statusFile: { exists: true, problem: null },
});
const i18n = () =>
  detail('i18n', [
    message('app-save', 'missing', null),
    message('app-open', 'translated', 'פתיחה'),
    message('app-close', 'outdated', 'סגירה'),
  ]);

type SaveAnswer = Result<CatalogSaveDto, ErrorDto>;
const savedAll = (messages: readonly MessageSaveDto[]): SaveAnswer => ({
  ok: true,
  value: {
    path: 'i18n/he.json',
    written: true,
    messages: messages.map(({ key }) => ({ key, status: 'translated' })),
    statusProblem: null,
  },
});

/**
 * Opens a project with catalogs (and pages, with `withPages`). Reading a catalog answers with
 * `catalogs` as it is at the time, so a test can change what's "on disk"; saving answers
 * through `save`.
 */
async function opened(
  options: {
    catalogs?: Record<string, CatalogDetailDto>;
    save?: (messages: readonly MessageSaveDto[]) => Promise<SaveAnswer>;
    keep?: Result<readonly SavedMessageDto[], ErrorDto>;
    withPages?: boolean;
  } = {},
) {
  const catalogs = options.catalogs ?? { i18n: i18n() };
  const { client, calls } = fakeClient({
    open: [
      {
        ok: true,
        value: {
          ...summary,
          documentFormat: options.withPages === true ? summary.documentFormat : null,
          catalogFormat: banana,
        },
      },
    ],
    list: [{ ok: true, value: options.withPages === true ? documents : [] }],
    catalogs: {
      ok: true,
      value: {
        catalogs: Object.keys(catalogs).map((key) => ({
          key,
          sourcePath: `${key}/en.json`,
          targetPath: `${key}/he.json`,
          targetExists: true,
          hasDraft: false,
          progress: null,
          problem: null,
        })),
        statusFile: { exists: true, problem: null },
      },
    },
    ...(options.keep === undefined ? {} : { keepMessages: options.keep }),
  });
  const saved: MessageSaveDto[][] = [];
  const wrapped: PaperLionApi = {
    ...client,
    readCatalog: ({ projectId, key }) => {
      calls.push(`readCatalog:${projectId}:${key}`);
      const found = catalogs[key];
      return Promise.resolve(
        found === undefined
          ? { ok: false, error: error('workspace.unknown-catalog', { key }) }
          : { ok: true, value: structuredClone(found) },
      );
    },
    saveCatalog: (request) => {
      calls.push(`saveCatalog:${request.catalog}`);
      saved.push(structuredClone([...request.messages]));
      return (options.save ?? ((messages) => Promise.resolve(savedAll(messages))))(
        request.messages,
      );
    },
  };
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, wrapped, {
    preferences: memoryPreferences(),
    systemLanguages: ['en-US'],
  });
  unmount = () => {
    app.unmount();
  };
  button(element, 'Open folder…').click();
  await settle();
  return { element, calls, saved, catalogs };
}

async function settle() {
  await flushPromises();
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
}
function button(element: Element, text: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}
const saveButton = (element: Element) => {
  const found = element.querySelector<HTMLButtonElement>('.catalog-save button');
  if (found === null) throw new Error('no Save button');
  return found;
};
const saveStatus = (element: Element) =>
  element.querySelector('.catalog-save-status')?.textContent.trim();
const row = (element: Element, key: string) => {
  const found = element.querySelector<HTMLElement>(`tr[data-key="${key}"]`);
  if (found === null) throw new Error(`no row "${key}"`);
  return found;
};
function editor(element: Element): EditorView {
  const content = element
    .querySelector('tr[data-open] .message-editor')
    ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
  const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
  if (view === null) throw new Error('no message editor');
  return view;
}
/** Opens a message and types `text` at its start. */
async function type(element: Element, key: string, text: string) {
  row(element, key).click();
  await settle();
  editor(element).dispatch({ changes: { from: 0, insert: text } });
  await settle();
}
const sidebarItem = (element: Element, key: string) => {
  const found = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === key,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no sidebar item "${key}"`);
  return found;
};
const alerts = (element: Element) =>
  [...element.querySelectorAll('.catalog [role="alert"]')].map((alert) =>
    alert.textContent.replace(/\s+/g, ' ').trim(),
  );
const unsavedDialog = () => document.querySelector<HTMLDialogElement>('dialog.unsaved');

describe('saving a catalog', () => {
  it('saves every edited message with what it started from, then reads the catalog again', async () => {
    const { element, calls, saved, catalogs } = await opened();
    expect(saveButton(element).disabled).toBe(true);
    expect(saveStatus(element)).toBe('');
    await type(element, 'app-save', 'שמירה');
    await type(element, 'app-close', 'נ');
    expect(saveButton(element).disabled).toBe(false);
    expect(saveStatus(element)).toBe('2 messages not saved yet');

    // What's on disk after the save, for the catalog read again.
    catalogs.i18n = detail('i18n', [
      message('app-save', 'translated', 'שמירה'),
      message('app-open', 'translated', 'פתיחה'),
      message('app-close', 'translated', 'נסגירה'),
    ]);
    const reads = calls.filter((call) => call.startsWith('readCatalog')).length;
    const lists = calls.filter((call) => call.startsWith('listCatalogs')).length;
    saveButton(element).click();
    await settle();
    expect(saved).toEqual([
      [
        { key: 'app-save', text: 'שמירה', base: null, source: 'Source of app-save' },
        { key: 'app-close', text: 'נסגירה', base: 'סגירה', source: 'Source of app-close' },
      ],
    ]);
    expect(calls.filter((call) => call.startsWith('readCatalog'))).toHaveLength(reads + 1);
    expect(calls.filter((call) => call.startsWith('listCatalogs'))).toHaveLength(lists + 1);
    expect(saveStatus(element)).toBe('Saved');
    expect(saveButton(element).disabled).toBe(true);
    expect(row(element, 'app-save').dataset.status).toBe('translated');
    expect(row(element, 'app-save').querySelector('.catalog-edited')).toBeNull();
  });

  it('saves with Ctrl+S or Cmd+S, wherever the focus is', async () => {
    const { element, saved } = await opened();
    await type(element, 'app-save', 'שמירה');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ד', code: 'KeyS', ctrlKey: true }));
    await settle();
    expect(saved).toHaveLength(1);
    await type(element, 'app-open', 'x');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true }));
    await settle();
    expect(saved).toHaveLength(2);
  });

  it('keeps the edits and shows why when saving is refused', async () => {
    const changed = error('workspace.catalog-changed', { file: 'i18n/he.json' }, ['app-save']);
    const { element } = await opened({
      save: () => Promise.resolve({ ok: false, error: changed }),
    });
    await type(element, 'app-save', 'שמירה');
    saveButton(element).click();
    await settle();
    expect(alerts(element)).toEqual([
      'Not saved: i18n/he.json changed on disk since you started editing (some of the messages you edited are different there now). Open the catalog again to see them.',
    ]);
    expect(saveStatus(element)).toBe('One message not saved yet');
    expect(editor(element).state.doc.toString()).toBe('שמירה');
  });

  it('says when the saved messages couldn’t be recorded as up to date', async () => {
    const problem = error('workspace.status-invalid', { file: '.paperl10n/status/he.json' });
    const { element } = await opened({
      save: (messages) => {
        const answer = savedAll(messages);
        return Promise.resolve(
          answer.ok ? { ok: true, value: { ...answer.value, statusProblem: problem } } : answer,
        );
      },
    });
    await type(element, 'app-save', 'שמירה');
    saveButton(element).click();
    await settle();
    expect(saveStatus(element)).toBe('Saved');
    expect(alerts(element)[0]).toMatch(/^Saved, but not recorded as up to date\. /);
  });

  it('keeps a message typed into during the save, from the text just saved', async () => {
    let answer: ((value: SaveAnswer) => void) | undefined;
    const { element, saved } = await opened({
      save: () => new Promise((resolve) => (answer = resolve)),
    });
    await type(element, 'app-save', 'שמירה');
    saveButton(element).click();
    await settle();
    expect(saveStatus(element)).toBe('Saving…');
    editor(element).dispatch({ changes: { from: 5, insert: '!' } });
    answer?.(savedAll(saved[0] ?? []));
    await settle();
    expect(saveStatus(element)).toBe('One message not saved yet');
    saveButton(element).click();
    await settle();
    expect(saved[1]).toEqual([
      { key: 'app-save', text: 'שמירה!', base: 'שמירה', source: 'Source of app-save' },
    ]);
  });
});

describe('saving a long catalog', () => {
  it('keeps its place when the catalog is read again after a save', async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      message(`msg-${String(i)}`, 'missing', null),
    );
    const { element } = await opened({ catalogs: { i18n: detail('i18n', many) } });
    await type(element, 'msg-0', 'א');
    const box = element.querySelector<HTMLElement>('.catalog-scroll');
    if (box === null) throw new Error('no scroll box');
    box.scrollTop = 72 * 500;
    box.dispatchEvent(new Event('scroll'));
    await settle();
    saveButton(element).click();
    await settle();
    expect(saveStatus(element)).toBe('Saved');
    expect(box.scrollTop).toBe(72 * 500);
  });
});

describe('keeping a message as up to date', () => {
  it('offers it on an outdated message not edited, and reads the catalog again after', async () => {
    const { element, calls, catalogs } = await opened();
    row(element, 'app-open').click();
    await settle();
    expect(row(element, 'app-open').querySelector('.catalog-keep')).toBeNull();
    row(element, 'app-close').click();
    await settle();
    expect(row(element, 'app-close').querySelector('.catalog-keep p')?.textContent).toBe(
      'The source changed since this translation was saved. If the translation still fits, keep it as up to date.',
    );
    catalogs.i18n = detail('i18n', [
      message('app-save', 'missing', null),
      message('app-open', 'translated', 'פתיחה'),
      message('app-close', 'translated', 'סגירה'),
    ]);
    button(element, 'Keep as up to date').click();
    await settle();
    expect(calls).toContain(
      `keepMessagesUpToDate:p-1:i18n:${JSON.stringify([{ key: 'app-close', source: 'Source of app-close' }])}`,
    );
    expect(row(element, 'app-close').dataset.status).toBe('translated');
    expect(row(element, 'app-close').querySelector('.catalog-keep')).toBeNull();
  });

  it('isn’t offered once the message is edited, and shows why keeping fails', async () => {
    const changed = error('workspace.source-changed', { file: 'i18n/en.json' });
    const { element } = await opened({ keep: { ok: false, error: changed } });
    row(element, 'app-close').click();
    await settle();
    button(element, 'Keep as up to date').click();
    await settle();
    expect(alerts(element)).toHaveLength(1);
    editor(element).dispatch({ changes: { from: 0, insert: 'x' } });
    await settle();
    expect(row(element, 'app-close').querySelector('.catalog-keep')).toBeNull();
  });
});

describe('leaving a catalog with edits', () => {
  it('asks first: staying keeps the edits; saving saves, then goes', async () => {
    const { element, saved } = await opened({
      catalogs: { i18n: i18n(), api: detail('api', [message('api-x', 'missing', null)]) },
    });
    await type(element, 'app-save', 'שמירה');
    sidebarItem(element, 'api').click();
    await settle();
    expect(unsavedDialog()?.open).toBe(true);
    expect(unsavedDialog()?.textContent).toContain('i18n');
    button(element, 'Cancel').click();
    await settle();
    expect(element.querySelector('.catalog-title')?.textContent).toBe('i18n');
    expect(saveStatus(element)).toBe('One message not saved yet');

    sidebarItem(element, 'api').click();
    await settle();
    [...(unsavedDialog()?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.textContent.trim() === 'Save')
      ?.click();
    await settle();
    expect(saved).toHaveLength(1);
    expect(element.querySelector('.catalog-title')?.textContent).toBe('api');
  });

  it('stays when saving fails', async () => {
    const failed = error('workspace.catalog-unwritable', { file: 'i18n/he.json', problem: 'x' });
    const { element } = await opened({
      catalogs: { i18n: i18n(), api: detail('api', []) },
      save: () => Promise.resolve({ ok: false, error: failed }),
    });
    await type(element, 'app-save', 'שמירה');
    sidebarItem(element, 'api').click();
    await settle();
    [...(unsavedDialog()?.querySelectorAll('button') ?? [])]
      .find((candidate) => candidate.textContent.trim() === 'Save')
      ?.click();
    await settle();
    expect(element.querySelector('.catalog-title')?.textContent).toBe('i18n');
    expect(alerts(element)).toHaveLength(1);
  });

  it('asks before going to a page, and before the window closes', async () => {
    const { element, calls } = await opened({ withPages: true });
    sidebarItem(element, 'i18n').click();
    await settle();
    await type(element, 'app-save', 'שמירה');
    const page = [...element.querySelectorAll('nav li button')].find(
      (candidate) => candidate.querySelector('bdi')?.textContent === 'index',
    );
    if (!(page instanceof HTMLButtonElement)) throw new Error('no index page');
    page.click();
    await settle();
    expect(unsavedDialog()?.open).toBe(true);
    button(element, "Don't save").click();
    await settle();
    expect(element.querySelector('.catalog-title')).toBeNull();
    // Only the catalog's edits are dropped: no page draft is touched.
    expect(calls.filter((call) => call.startsWith('discardDraft'))).toEqual([]);

    sidebarItem(element, 'i18n').click();
    await settle();
    await type(element, 'app-save', 'שמירה');
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
  });
});
