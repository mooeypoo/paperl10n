// SPDX-License-Identifier: GPL-3.0-or-later
// Starting, editing, and saving a translation, and the unsaved-changes guard, through the whole UI
// (mountApp) with a fake client.
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, error, fakeClient, pairFor, summary } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

type Answers = Parameters<typeof fakeClient>[0];

/** Opens the basic project: guide/getting-started (no translation yet) is selected first. */
async function opened(answers: Answers = {}) {
  const { client, calls } = fakeClient({
    open: [
      { ok: true, value: summary },
      { ok: true, value: { ...summary, projectId: 'p-2' } },
    ],
    list: [
      { ok: true, value: documents },
      { ok: true, value: documents },
    ],
    read: { index: { ok: true, value: pairFor('index', 'Home\r\n', 'בית\r\n') } },
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

function button(element: Element, text: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

const targetPane = (element: Element) => element.querySelectorAll('section[lang]')[1];

/** The translation pane's editor. */
function targetEditor(element: Element): EditorView {
  const content = targetPane(element)
    ?.querySelector('.markdown-editor')
    ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
  const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
  if (view === null) throw new Error('no translation editor');
  return view;
}

/** Types at the end of the translation, then lets the UI update. */
const type = async (element: Element, text: string) => {
  const view = targetEditor(element);
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  await flushPromises();
};
const status = (element: Element) =>
  targetPane(element)?.querySelector('[role="status"]')?.textContent.trim();
const saveButton = (element: Element, name = 'Save') =>
  button(targetPane(element) ?? element, name);
const page = (element: Element, key: string) => {
  const found = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === key,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no page "${key}"`);
  return found;
};
const pageStatus = (element: Element, key: string) =>
  page(element, key).querySelector('.pages-status')?.getAttribute('data-status');
const unsavedDialog = () => document.querySelector<HTMLDialogElement>('dialog.unsaved');
const pressSave = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));

describe('starting and saving a translation', () => {
  it('starts a new translation from a copy of the source, and saving creates the file', async () => {
    const { element, calls } = await opened();
    button(element, 'Start translating').click();
    await flushPromises();
    expect(targetEditor(element).state.doc.toString()).toBe('Source of guide/getting-started\n');
    expect(status(element)).toBe('Unsaved changes');
    expect(targetPane(element)?.textContent).toContain('A copy of the source.');
    expect(pageStatus(element, 'guide/getting-started')).toBe('unsaved');

    await type(element, 'מבוא\n');
    saveButton(element).click();
    await flushPromises();
    expect(calls.at(-1)).toBe(
      'saveDocument:p-1:guide/getting-started:"Source of guide/getting-started\\nמבוא\\n":new',
    );
    expect(status(element)).toBe('Saved');
    expect(saveButton(element).disabled).toBe(true);
    expect(targetPane(element)?.textContent).not.toContain('A copy of the source.');
    // The page has a translation now, and stays selected.
    expect(pageStatus(element, 'guide/getting-started')).toBe('started');
    expect(page(element, 'guide/getting-started').getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('nav')?.textContent).toContain('With a translation: 2 of 2');
  });

  it('saves an edited translation with Ctrl+S, from any keyboard layout, against the file', async () => {
    const { element, calls } = await opened();
    page(element, 'index').click();
    await flushPromises();
    expect(saveButton(element).disabled).toBe(true);
    await type(element, 'עוד\r\n');
    expect(saveButton(element).disabled).toBe(false);
    // A Hebrew layout: the key is "ד", the physical key is still S.
    expect(pressSave({ key: 'ד', code: 'KeyS', ctrlKey: true })).toBe(false);
    await flushPromises();
    expect(calls.at(-1)).toBe('saveDocument:p-1:index:"בית\\r\\nעוד\\r\\n":"בית\\r\\n"');
    expect(status(element)).toBe('Saved');
    // Cmd+S too; with nothing unsaved it sends nothing.
    pressSave({ key: 's', code: 'KeyS', metaKey: true });
    await flushPromises();
    expect(calls.filter((call) => call.startsWith('saveDocument'))).toHaveLength(1);
    // Other shortcuts are left alone.
    expect(pressSave({ key: 's', code: 'KeyS', ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it('shows why a save failed, and keeps the changes unsaved', async () => {
    const failure = error('workspace.document-changed', { file: 'he/index.md' });
    const { element } = await opened({ save: { ok: false, error: failure } });
    page(element, 'index').click();
    await flushPromises();
    await type(element, '!');
    saveButton(element).click();
    await flushPromises();
    expect(targetPane(element)?.querySelector('[role="alert"]')?.textContent).toContain(
      "he/index.md changed on disk since you started editing it, so it wasn't overwritten.",
    );
    expect(status(element)).toBe('Unsaved changes');
    expect(pageStatus(element, 'index')).toBe('unsaved');
  });
});

describe('leaving a page with unsaved changes', () => {
  async function dirtyIndex(answers: Answers = {}) {
    const app = await opened(answers);
    page(app.element, 'index').click();
    await flushPromises();
    await type(app.element, '!');
    return app;
  }

  it('leaves at once when nothing is unsaved', async () => {
    const { element } = await opened();
    page(element, 'index').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(false);
    expect(page(element, 'index').getAttribute('aria-current')).toBe('page');
  });

  it('asks first, and Cancel stays on the page with the changes', async () => {
    const { element } = await dirtyIndex();
    page(element, 'guide/getting-started').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(true);
    expect(unsavedDialog()?.textContent).toContain(
      "Your changes to the translation of ⁨index⁩ aren't saved yet.",
    );
    button(element, 'Cancel').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(false);
    expect(page(element, 'index').getAttribute('aria-current')).toBe('page');
    expect(targetEditor(element).state.doc.toString()).toBe('בית\n!');
  });

  it("leaves without saving on Don't save", async () => {
    const { element, calls } = await dirtyIndex();
    page(element, 'guide/getting-started').click();
    await flushPromises();
    button(element, "Don't save").click();
    await flushPromises();
    expect(page(element, 'guide/getting-started').getAttribute('aria-current')).toBe('page');
    expect(calls.some((call) => call.startsWith('saveDocument'))).toBe(false);
    expect(pageStatus(element, 'index')).toBe('started');
  });

  it('saves, then leaves, on Save', async () => {
    const { element, calls } = await dirtyIndex();
    page(element, 'guide/getting-started').click();
    await flushPromises();
    button(unsavedDialog() ?? element, 'Save').click();
    await flushPromises();
    expect(calls.at(-2)).toBe('saveDocument:p-1:index:"בית\\r\\n!":"בית\\r\\n"');
    expect(page(element, 'guide/getting-started').getAttribute('aria-current')).toBe('page');
  });

  it('stays, with the error showing, when saving from the question fails', async () => {
    const failure = error('workspace.document-unwritable', {
      file: 'he/index.md',
      problem: 'files.unwritable',
    });
    const failing = await dirtyIndex({ save: { ok: false, error: failure } });
    page(failing.element, 'guide/getting-started').click();
    await flushPromises();
    button(unsavedDialog() ?? failing.element, 'Save').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(false);
    expect(page(failing.element, 'index').getAttribute('aria-current')).toBe('page');
    expect(targetPane(failing.element)?.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('asks before opening another project, and before changing the language', async () => {
    const { element, calls } = await dirtyIndex();
    button(element, 'Open folder…').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(true);
    expect(calls.filter((call) => call === 'openProject')).toHaveLength(1);
    button(element, 'Cancel').click();
    await flushPromises();

    element.querySelector<HTMLButtonElement>('.header-target')?.click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(true);
    expect(document.querySelector<HTMLDialogElement>('dialog.picker')?.open).toBe(false);
    button(element, "Don't save").click();
    await flushPromises();
    expect(document.querySelector<HTMLDialogElement>('dialog.picker')?.open).toBe(true);
  });

  it('keeps unsaved changes when the interface language changes', async () => {
    const { element } = await dirtyIndex();
    const language = element.querySelector<HTMLSelectElement>('.header-language select');
    if (language === null) throw new Error('no interface language');
    language.value = 'he';
    language.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(targetEditor(element).state.doc.toString()).toBe('בית\n!');
    expect(pageStatus(element, 'index')).toBe('unsaved');
    expect(saveButton(element, 'שמירה').disabled).toBe(false);
  });

  it('stops the window from closing and asks; a clean page closes without asking', async () => {
    const { element } = await dirtyIndex();
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    await flushPromises();
    expect(closing.defaultPrevented).toBe(true);
    expect(unsavedDialog()?.open).toBe(true);
    button(element, 'Cancel').click();
    await flushPromises();

    targetEditor(element).dispatch({ changes: { from: 4, to: 5 } });
    await flushPromises();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
});

describe('drafts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const withDraft = {
    ...pairFor('index', 'Home\r\n', 'בית\r\n'),
    draft: { text: 'בית ועוד\r\n', base: 'בית\r\n' },
  };

  it('opens a page with its draft, unsaved, and offers to discard it', async () => {
    const { element, calls } = await opened({
      list: [
        {
          ok: true,
          value: documents.map((document) => ({ ...document, hasDraft: document.key === 'index' })),
        },
      ],
      read: { index: { ok: true, value: withDraft } },
    });
    // The page list shows which pages have unsaved changes kept from before.
    expect(pageStatus(element, 'index')).toBe('unsaved');
    page(element, 'index').click();
    await flushPromises();
    expect(targetEditor(element).state.doc.toString()).toBe('בית ועוד\n');
    expect(status(element)).toBe('Unsaved changes');
    expect(targetPane(element)?.textContent).toContain(
      'Unsaved changes from your last session were restored.',
    );
    // The file is still what the draft started from: nothing to warn about.
    expect(targetPane(element)?.textContent).not.toContain('changed on disk');

    button(targetPane(element) ?? element, 'Discard them').click();
    await flushPromises();
    expect(calls.at(-1)).toBe('discardDraft:p-1:index');
    expect(targetEditor(element).state.doc.toString()).toBe('בית\n');
    expect(status(element)).toBe('');
    expect(pageStatus(element, 'index')).toBe('started');
  });

  it("saves a restored draft against the draft's base, and the page's marker goes", async () => {
    const { element, calls } = await opened({
      list: [
        {
          ok: true,
          value: documents.map((document) => ({ ...document, hasDraft: document.key === 'index' })),
        },
      ],
      read: { index: { ok: true, value: withDraft } },
    });
    page(element, 'index').click();
    await flushPromises();
    saveButton(element).click();
    await flushPromises();
    expect(calls.at(-1)).toBe('saveDocument:p-1:index:"בית ועוד\\r\\n":"בית\\r\\n"');
    expect(targetPane(element)?.textContent).not.toContain('were restored');
    expect(pageStatus(element, 'index')).toBe('started');
  });

  it('keeps edits as a draft while typing, and drops it on "Don\'t save"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { element, calls } = await opened();
    page(element, 'index').click();
    await flushPromises();
    await type(element, '!');
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.at(-1)).toBe('saveDraft:p-1:index:"בית\\r\\n!":"בית\\r\\n"');

    page(element, 'guide/getting-started').click();
    await flushPromises();
    button(element, "Don't save").click();
    await flushPromises();
    expect(calls.at(-2)).toBe('discardDraft:p-1:index');
    expect(pageStatus(element, 'index')).toBe('started');
  });
});

describe('a translation changed on disk', () => {
  const changed = error('workspace.document-changed', { file: 'he/index.md' });
  const conflictDialog = () => document.querySelector<HTMLDialogElement>('dialog.conflict');
  const theirs = pairFor('index', 'Home\r\n', 'שלהם\r\n');

  /** Opens index, types, and saves into a conflict. `read` may be changed later (what's on disk). */
  async function conflicted(answers: Answers = {}) {
    const app = await opened({ save: [{ ok: false, error: changed }], ...answers });
    page(app.element, 'index').click();
    await flushPromises();
    await type(app.element, '!');
    saveButton(app.element).click();
    await flushPromises();
    return app;
  }

  it('asks what to keep, keep editing by default; keeping on editing asks again on the next save', async () => {
    const { element } = await conflicted();
    const dialog = conflictDialog();
    expect(dialog?.open).toBe(true);
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.textContent).toContain('⁨he/index.md⁩ was changed outside Paper Lion');
    expect(document.activeElement?.textContent.trim()).toBe('Keep editing');

    button(dialog ?? element, 'Keep editing').click();
    await flushPromises();
    expect(conflictDialog()?.open).toBe(false);
    expect(status(element)).toBe('Unsaved changes');
    expect(targetPane(element)?.querySelector('[role="alert"]')?.textContent).toContain(
      'changed on disk',
    );

    // Ctrl+S tries again: the fake now accepts, as if the file were back as it was.
    pressSave({ key: 's', code: 'KeyS', ctrlKey: true });
    await flushPromises();
    expect(status(element)).toBe('Saved');
  });

  it('keeps editing on Escape, and ignores Ctrl+S while asking', async () => {
    const { element, calls } = await conflicted();
    pressSave({ key: 's', code: 'KeyS', ctrlKey: true });
    await flushPromises();
    expect(calls.filter((call) => call.startsWith('saveDocument'))).toHaveLength(1);
    conflictDialog()?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await flushPromises();
    expect(conflictDialog()?.open).toBe(false);
    expect(status(element)).toBe('Unsaved changes');
  });

  it('reloads from disk: the edits and their draft go, and the editor shows the file', async () => {
    const read: Record<string, { ok: true; value: typeof theirs }> = {
      index: {
        ok: true,
        value: { ...theirs, draft: { text: 'בית ועוד\r\n', base: 'בית\r\n' } },
      },
    };
    const { element, calls } = await opened({
      list: [
        {
          ok: true,
          value: documents.map((document) => ({ ...document, hasDraft: document.key === 'index' })),
        },
      ],
      read,
      save: { ok: false, error: changed },
    });
    page(element, 'index').click();
    await flushPromises();
    // The draft started from text the file no longer has.
    expect(targetPane(element)?.textContent).toContain(
      'The file has changed on disk since, so saving will ask which version to keep.',
    );
    saveButton(element).click();
    await flushPromises();
    expect(conflictDialog()?.open).toBe(true);

    read.index = { ok: true, value: theirs };
    button(conflictDialog() ?? element, 'Reload from disk').click();
    await flushPromises();
    expect(calls.slice(-2)).toEqual(['discardDraft:p-1:index', 'readDocumentPair:p-1:index']);
    expect(conflictDialog()?.open).toBe(false);
    expect(targetEditor(element).state.doc.toString()).toBe('שלהם\n');
    expect(status(element)).toBe('');
    expect(targetPane(element)?.querySelector('[role="alert"]')).toBeNull();
    expect(pageStatus(element, 'index')).toBe('started');
  });

  it('overwrites with mine, against the file as it is now', async () => {
    const read = { index: { ok: true as const, value: pairFor('index', 'Home\r\n', 'בית\r\n') } };
    const { element, calls } = await conflicted({ read });
    read.index = { ok: true, value: theirs };
    button(conflictDialog() ?? element, 'Overwrite with mine').click();
    await flushPromises();
    expect(calls.slice(-2)).toEqual([
      'readDocumentPair:p-1:index',
      'saveDocument:p-1:index:"בית\\r\\n!":"שלהם\\r\\n"',
    ]);
    expect(conflictDialog()?.open).toBe(false);
    expect(status(element)).toBe('Saved');
    expect(targetPane(element)?.querySelector('[role="alert"]')).toBeNull();
    expect(targetEditor(element).state.doc.toString()).toBe('בית\n!');
  });

  it('stays on the page when saving from the unsaved-changes question finds a conflict', async () => {
    const { element } = await opened({ save: [{ ok: false, error: changed }] });
    page(element, 'index').click();
    await flushPromises();
    await type(element, '!');
    page(element, 'guide/getting-started').click();
    await flushPromises();
    button(unsavedDialog() ?? element, 'Save').click();
    await flushPromises();
    expect(unsavedDialog()?.open).toBe(false);
    expect(conflictDialog()?.open).toBe(true);
    expect(page(element, 'index').getAttribute('aria-current')).toBe('page');

    // Closing the window waits for the conflict's answer, rather than asking a second question.
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    await flushPromises();
    expect(closing.defaultPrevented).toBe(true);
    expect(unsavedDialog()?.open).toBe(false);
  });
});
