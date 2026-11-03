// SPDX-License-Identifier: GPL-3.0-or-later
// A catalog's drafts and removals in the UI (M4 C7d), through the real entry point with a fake
// client: edits kept as the draft after a pause, a draft restored when the catalog opens (and
// discarded), the sidebar's unsaved marker, and removing messages the source no longer has.
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  ErrorDto,
  MessageSaveDto,
  PaperLionApi,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { error, fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
  context: null,
  sourceForms: null,
  translationForms: null,
  needsReview: false,
  previousSource: null,
});
const detail = (key: string, overrides: Partial<CatalogDetailDto> = {}): CatalogDetailDto => ({
  key,
  sourcePath: `${key}/en.json`,
  targetPath: `${key}/he.json`,
  targetExists: true,
  documentationPath: null,
  messages: [message('app-save', 'missing', null), message('app-open', 'draft', 'פתיחה')],
  notInSource: [],
  documentationProblem: null,
  pluralForms: [],
  draft: null,
  statusFile: { exists: true, problem: null },
  ...overrides,
});
const restored: MessageSaveDto = {
  key: 'app-save',
  text: 'שמירה',
  base: null,
  source: 'Source of app-save',
};

async function opened(
  options: {
    catalogs?: Record<string, CatalogDetailDto>;
    hasDraft?: readonly string[];
    saveDraft?: Result<null, ErrorDto>;
  } = {},
) {
  const catalogs = options.catalogs ?? { i18n: detail('i18n') };
  const { client, calls } = fakeClient({
    open: [{ ok: true, value: { ...summary, documentFormat: null, catalogFormat: banana } }],
    list: [{ ok: true, value: [] }],
    catalogs: {
      ok: true,
      value: {
        catalogs: Object.keys(catalogs).map((key) => ({
          key,
          sourcePath: `${key}/en.json`,
          targetPath: `${key}/he.json`,
          targetExists: true,
          hasDraft: options.hasDraft?.includes(key) ?? false,
          progress: null,
          problem: null,
        })),
        statusFile: { exists: true, problem: null },
      },
    },
    ...(options.saveDraft === undefined ? {} : { saveCatalogDraft: options.saveDraft }),
  });
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
  return { element, calls, catalogs };
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
const sidebarItem = (element: Element, key: string) => {
  const found = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === key,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no sidebar item "${key}"`);
  return found;
};
const marked = (element: Element, key: string) =>
  sidebarItem(element, key).querySelector('.pages-unsaved') !== null;
const saveStatus = (element: Element) =>
  element.querySelector('.catalog-save-status')?.textContent.trim();
const draftCalls = (calls: string[]) =>
  calls.filter(
    (call) => call.startsWith('saveCatalogDraft') || call.startsWith('discardCatalogDraft'),
  );

describe('a catalog’s draft', () => {
  it('keeps the edits as the draft once typing pauses, and marks the catalog in the sidebar', async () => {
    const { element, calls } = await opened();
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: 'ש' } });
    await vi.advanceTimersByTimeAsync(500);
    editor(element).dispatch({ changes: { from: 1, insert: 'מ' } });
    await vi.advanceTimersByTimeAsync(799);
    expect(draftCalls(calls)).toEqual([]);
    // Marked while unsaved, before the draft is even kept, and the legend says what the mark is.
    expect(marked(element, 'i18n')).toBe(true);
    expect(element.querySelector('.pages-legend')?.textContent).toContain('Unsaved changes');
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(draftCalls(calls)).toEqual([
      `saveCatalogDraft:p-1:i18n:${JSON.stringify([{ ...restored, text: 'שמ' }])}`,
    ]);
    // Typed back to nothing: the draft is kept with no edits, which forgets it.
    editor(element).dispatch({ changes: { from: 0, to: 2 } });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(draftCalls(calls).at(-1)).toBe('saveCatalogDraft:p-1:i18n:[]');
    expect(marked(element, 'i18n')).toBe(false);
  });

  it('restores a draft when the catalog opens, says so, and discards it on request', async () => {
    const { element, calls } = await opened({
      catalogs: { i18n: detail('i18n', { draft: { messages: [restored] } }) },
      hasDraft: ['i18n'],
    });
    expect(marked(element, 'i18n')).toBe(true);
    expect(element.querySelector('.catalog-restored p')?.textContent.trim()).toBe(
      'Unsaved changes from your last session were restored.',
    );
    expect(row(element, 'app-save').children[2]?.querySelector('.catalog-clamp')?.textContent).toBe(
      'שמירה',
    );
    expect(saveStatus(element)).toBe('One message not saved yet');
    // Restoring isn't an edit: nothing is kept again.
    await vi.advanceTimersByTimeAsync(1000);
    expect(draftCalls(calls)).toEqual([]);

    button(element, 'Discard them').click();
    await settle();
    expect(draftCalls(calls)).toEqual(['discardCatalogDraft:p-1:i18n']);
    expect(element.querySelector('.catalog-restored')).toBeNull();
    expect(saveStatus(element)).toBe('');
    expect(marked(element, 'i18n')).toBe(false);
  });

  it('says when restored messages changed on disk since, and stops saying so once saved', async () => {
    const changed = { ...restored, key: 'app-open', base: 'פתח' };
    const { element } = await opened({
      catalogs: { i18n: detail('i18n', { draft: { messages: [changed] } }) },
    });
    expect(element.querySelector('.catalog-restored p')?.textContent).toContain(
      'changed on disk since',
    );
    element.querySelector<HTMLButtonElement>('.catalog-save button')?.click();
    await settle();
    expect(element.querySelector('.catalog-restored')).toBeNull();
  });

  it('forgets the draft when leaving without saving, and never keeps another catalog’s', async () => {
    const { element, calls } = await opened({
      catalogs: { i18n: detail('i18n'), api: detail('api') },
    });
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: 'ש' } });
    sidebarItem(element, 'api').click();
    await settle();
    button(element, "Don't save").click();
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    // The pending draft wasn't kept; the dropped one was forgotten; `api`'s untouched.
    expect(draftCalls(calls)).toEqual(['discardCatalogDraft:p-1:i18n']);
    expect(element.querySelector('.catalog-title')?.textContent).toBe('api');
  });

  it('shows why the draft couldn’t be kept', async () => {
    const { element } = await opened({
      saveDraft: { ok: false, error: error('workspace.draft-unwritable') },
    });
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: 'ש' } });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(element.querySelector('.catalog [role="alert"]')?.textContent).toContain(
      "couldn't be kept as a draft",
    );
  });
});

describe('messages the source no longer has', () => {
  const orphans = detail('i18n', {
    notInSource: [
      { key: 'app-old', text: 'ישן', tokens: [] },
      { key: 'app-gone', text: 'נעלם', tokens: [] },
    ],
  });
  const item = (element: Element, key: string) => {
    const found = [...element.querySelectorAll('.catalog-orphans li')].find(
      (li) => li.querySelector('bdi')?.textContent === key,
    );
    if (!(found instanceof HTMLElement)) throw new Error(`no item "${key}"`);
    return found;
  };

  it('removes one, keeps it again, or removes all, each saved with the rest', async () => {
    const { element, calls } = await opened({ catalogs: { i18n: orphans } });
    const remove = item(element, 'app-old').querySelector('button');
    expect(remove?.getAttribute('aria-label')).toBe('Remove app-old');
    remove?.click();
    await settle();
    expect(item(element, 'app-old').hasAttribute('data-removed')).toBe(true);
    expect(item(element, 'app-old').textContent).toContain('Removed when you save');
    expect(saveStatus(element)).toBe('One message not saved yet');
    item(element, 'app-old').querySelector('button')?.click();
    await settle();
    expect(item(element, 'app-old').hasAttribute('data-removed')).toBe(false);
    expect(saveStatus(element)).toBe('');

    button(element, 'Remove all').click();
    await settle();
    expect(saveStatus(element)).toBe('2 messages not saved yet');
    expect(element.querySelector('.catalog-orphans-heading button')).toBeNull();
    element.querySelector<HTMLButtonElement>('.catalog-save button')?.click();
    await settle();
    expect(calls).toContain(
      `saveCatalog:p-1:i18n:${JSON.stringify([
        { key: 'app-old', text: '', base: 'ישן', source: null },
        { key: 'app-gone', text: '', base: 'נעלם', source: null },
      ])}`,
    );
  });

  it('keeps removals in the draft too', async () => {
    const { element, calls } = await opened({ catalogs: { i18n: orphans } });
    item(element, 'app-gone').querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(draftCalls(calls)).toEqual([
      `saveCatalogDraft:p-1:i18n:${JSON.stringify([{ key: 'app-gone', text: '', base: 'נעלם', source: null }])}`,
    ]);
  });
});
