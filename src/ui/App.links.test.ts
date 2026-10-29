// SPDX-License-Identifier: GPL-3.0-or-later
// Editing a link through the link dialog, through the whole UI (mountApp) with a fake client.
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, fakeClient, pairFor, summary } from './test-support';

const source = 'See [the guide](/guide) here.\n';
const translation = 'ראו את [המדריך](/guide "t") כאן.\n';

let unmount: (() => void) | undefined;
beforeEach(() => {
  // happy-dom fires `selectionchange` synchronously, inside CodeMirror's update, so the editor
  // can't take focus here; the E2E covers it.
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Opens the basic project and the index page, whose source and translation have a link. */
async function opened() {
  const { client } = fakeClient({
    open: [{ ok: true, value: summary }],
    list: [{ ok: true, value: documents }],
    read: { index: { ok: true, value: pairFor('index', source, translation) } },
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

async function clickChip(view: EditorView): Promise<void> {
  const chip = view.contentDOM.querySelector('.cm-md-link-chip');
  if (chip === null) throw new Error('no link chip');
  chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await flushPromises();
}

const linkDialog = () => document.querySelector<HTMLDialogElement>('dialog.link-dialog');
const field = (name: string) => {
  const label = [...(linkDialog()?.querySelectorAll('label') ?? [])].find((candidate) =>
    candidate.textContent.includes(name),
  );
  const input = label?.querySelector('input');
  if (input === null || input === undefined) throw new Error(`no field "${name}"`);
  return input;
};
async function fill(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flushPromises();
}

describe('the link dialog', () => {
  it("edits a translation link's text and target in their own directions", async () => {
    const element = await opened();
    const editor = editorIn(element, 1);
    expect(linkDialog()?.open).toBe(false);
    await clickChip(editor);

    expect(linkDialog()?.open).toBe(true);
    expect(linkDialog()?.textContent).toContain('Edit link');
    // Interface text, in the interface's language, inside the Hebrew pane.
    expect([linkDialog()?.lang, linkDialog()?.dir]).toEqual(['en', 'ltr']);
    const text = field('Text');
    const url = field('Link target');
    expect([text.value, text.lang, text.dir]).toEqual(['המדריך', 'he', 'rtl']);
    expect([url.value, url.dir]).toEqual(['/guide', 'ltr']);

    await fill(text, 'המדריך המלא');
    await fill(url, '/guide/full');
    linkDialog()?.querySelector('form')?.requestSubmit();
    await flushPromises();
    expect(linkDialog()?.open).toBe(false);
    expect(editor.state.doc.toString()).toBe('ראו את [המדריך המלא](/guide/full "t") כאן.\n');
    expect(pane(element, 1)?.querySelector('[role="status"]')?.textContent.trim()).toBe(
      'Unsaved changes',
    );
  });

  it("can't apply without a target", async () => {
    const element = await opened();
    await clickChip(editorIn(element, 1));
    await fill(field('Link target'), '  ');
    expect(button(linkDialog() ?? element, 'Update link').disabled).toBe(true);
  });

  it('changes nothing on Escape or Cancel', async () => {
    const element = await opened();
    const editor = editorIn(element, 1);
    await clickChip(editor);
    await fill(field('Link target'), '/elsewhere');
    linkDialog()?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await flushPromises();
    expect(linkDialog()?.open).toBe(false);

    await clickChip(editor);
    expect(field('Link target').value).toBe('/guide');
    button(linkDialog() ?? element, 'Cancel').click();
    await flushPromises();
    expect(linkDialog()?.open).toBe(false);
    expect(editor.state.doc.toString()).toBe(translation);
  });

  it('removes a link, keeping its text', async () => {
    const element = await opened();
    const editor = editorIn(element, 1);
    await clickChip(editor);
    button(linkDialog() ?? element, 'Remove link').click();
    await flushPromises();
    expect(editor.state.doc.toString()).toBe('ראו את המדריך כאן.\n');
  });

  it('is only offered in the translation (the source is read-only)', async () => {
    const element = await opened();
    expect(pane(element, 0)?.querySelector('dialog')).toBeNull();
    expect(pane(element, 1)?.querySelector('dialog.link-dialog')).not.toBeNull();
  });
});
