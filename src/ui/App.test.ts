// SPDX-License-Identifier: GPL-3.0-or-later
// The whole UI through its real entry point (mountApp), with a fake client instead of IPC.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences, type PreferenceStore } from './preferences';
import { documents, error, fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

function start(
  client: ReturnType<typeof fakeClient>['client'],
  uiLocale?: 'en' | 'he',
  preferences: PreferenceStore = memoryPreferences(),
  systemLanguages: readonly string[] = ['en-US'],
) {
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, client, {
    preferences,
    systemLanguages,
    ...(uiLocale === undefined ? {} : { uiLocale }),
  });
  unmount = () => {
    app.unmount();
  };
  return element;
}

function button(element: Element, text: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
}

async function openedApp(overrides: Partial<typeof summary> = {}) {
  const { client } = fakeClient({
    open: [{ ok: true, value: { ...summary, ...overrides } }],
    list: [{ ok: true, value: documents }],
  });
  const element = start(client);
  button(element, 'Open folder…').click();
  await flushPromises();
  return element;
}

const panes = (element: Element) => [...element.querySelectorAll('section[lang]')];
/** A pane's accessible name: the text of the heading it's labelled by. */
const paneName = (pane: Element | undefined) =>
  pane === undefined
    ? undefined
    : document.getElementById(pane.getAttribute('aria-labelledby') ?? '')?.textContent;
const pageButtons = (element: Element) => [...element.querySelectorAll('nav li button')];

describe('the app shell', () => {
  it('offers a single "Open folder…" until a project is open, then keeps one in the header', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
    });
    const element = start(client);
    const openButtons = () =>
      [...element.querySelectorAll('button')].filter((b) => b.textContent.includes('Open folder…'));
    expect(openButtons()).toHaveLength(1);
    expect(element.querySelector('header')?.textContent).not.toContain('Open folder…');
    openButtons()[0]?.click();
    await flushPromises();
    expect(openButtons()).toHaveLength(1);
    expect(element.querySelector('header')?.textContent).toContain('Open folder…');
  });

  it('shows the project, its format, and the language pair by their own names', async () => {
    const header = (await openedApp()).querySelector('header');
    expect(header?.textContent).toContain('basic');
    expect(header?.textContent).toContain('Folder per locale (stub)');
    const names = [...(header?.querySelectorAll('.header-languages [lang]') ?? [])];
    expect(names.map((name) => [name.getAttribute('lang'), name.textContent])).toEqual([
      ['en', 'English'],
      ['he', 'עברית'],
    ]);
    expect(header?.querySelector('.header-languages .visually-hidden')?.textContent.trim()).toBe(
      'Translating from English into עברית',
    );
  });

  it('lists the pages and selects the first, showing its source and translation panes', async () => {
    const element = await openedApp();
    expect(pageButtons(element).map((b) => b.textContent.trim())).toEqual([
      'guide/getting-started',
      'index',
    ]);
    expect(pageButtons(element)[0]?.getAttribute('aria-current')).toBe('page');
    const [source, target] = panes(element);
    expect(paneName(source)).toBe('English · source');
    expect(source?.textContent).toContain('en/guide/getting-started.md');
    expect(target?.getAttribute('dir')).toBe('rtl');
    expect(paneName(target)).toBe('עברית · translation');
    expect(target?.textContent).toContain('he/guide/getting-started.md');
  });

  it('shows another page when it is chosen', async () => {
    const element = await openedApp();
    (pageButtons(element)[1] as HTMLButtonElement).click();
    await flushPromises();
    expect(pageButtons(element)[1]?.getAttribute('aria-current')).toBe('page');
    expect(pageButtons(element)[0]?.hasAttribute('aria-current')).toBe(false);
    expect(panes(element)[0]?.textContent).toContain('en/index.md');
    expect(element.querySelector('article h2')?.textContent).toBe('index');
  });

  it('finds pages by name, says how many match, and says when none do', async () => {
    const element = await openedApp();
    const search = element.querySelector<HTMLInputElement>('nav input[type="search"]');
    if (search === null) throw new Error('no page search');
    expect(element.querySelector('nav')?.textContent).toContain('2 documents');
    search.value = 'guide';
    search.dispatchEvent(new Event('input'));
    await flushPromises();
    expect(pageButtons(element).map((b) => b.textContent.trim())).toEqual([
      'guide/getting-started',
    ]);
    expect(element.querySelector('nav')?.textContent).toContain('1 of 2');
    search.value = 'zebra';
    search.dispatchEvent(new Event('input'));
    await flushPromises();
    expect(pageButtons(element)).toHaveLength(0);
    expect(element.querySelector('nav')?.textContent).toContain('No page matches "zebra".');
  });

  it('shows config warnings, marked as English', async () => {
    const element = await openedApp({ warnings: ['unknown key "theme" is ignored'] });
    const warning = element.querySelector('.app-warnings li');
    expect(warning?.textContent).toBe('unknown key "theme" is ignored');
    expect(warning?.getAttribute('lang')).toBe('en');
  });

  it('says so when the project has no pages', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: [] }],
    });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    expect(panes(element)).toHaveLength(0);
    expect(element.textContent).toContain('No source documents found.');
  });

  it('mirrors the shell in Hebrew, while each pane keeps its own direction', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
    });
    const element = start(client, 'he');
    button(element, 'פתיחת תיקייה…').click();
    await flushPromises();
    expect(document.documentElement.dir).toBe('rtl');
    expect(panes(element).map((pane) => pane.getAttribute('dir'))).toEqual(['ltr', 'rtl']);
    expect(paneName(panes(element)[0])).toBe('English · מקור');
  });

  it("gives pane headings the interface's direction, not the pane's", async () => {
    const element = await openedApp();
    const [source, target] = panes(element).map((pane) => pane.querySelector('h3'));
    expect([source?.getAttribute('lang'), source?.getAttribute('dir')]).toEqual(['en', 'ltr']);
    expect([target?.getAttribute('lang'), target?.getAttribute('dir')]).toEqual(['en', 'ltr']);
  });
});

describe('the app', () => {
  it('starts empty, then opens a project and shows both panes', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
    });
    const element = start(client);
    expect(element.textContent).toContain(
      'Open a project folder to see what there is to translate.',
    );

    button(element, 'Open folder…').click();
    await flushPromises();
    expect(panes(element)).toHaveLength(2);
    expect(panes(element)[1]?.getAttribute('dir')).toBe('rtl');
  });

  it('shows an error message from the message files, with its details', async () => {
    const failure = error('workspace.config-invalid', {}, ['targetLocale: is required']);
    const { client } = fakeClient({ open: [{ ok: false, error: failure }] });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The config file has problems:');
    expect(alert?.textContent).toContain('targetLocale: is required');
  });

  it('fills error parameters into the message', async () => {
    const failure = error('workspace.unknown-document-format', { formatId: 'format-nope' });
    const { client } = fakeClient({ open: [{ ok: false, error: failure }] });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('"format-nope"');
  });

  it('sets the page language and direction from the interface language, and mirrors on change', async () => {
    const { client } = fakeClient();
    const element = start(client);
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');

    const select = element.querySelector('select');
    if (select === null) throw new Error('no language selector');
    select.value = 'he';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(button(element, 'פתיחת תיקייה…')).toBeDefined();
  });

  it('remembers the interface language', async () => {
    const preferences = memoryPreferences();
    const element = start(fakeClient().client, undefined, preferences);
    const select = element.querySelector('select');
    if (select === null) throw new Error('no language selector');
    select.value = 'he';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    unmount?.();
    start(fakeClient().client, undefined, preferences);
    expect(document.documentElement.lang).toBe('he');
  });

  it.each<[string, readonly string[], string]>([
    ['a supported system language', ['he-IL', 'en-US'], 'he'],
    ['the first supported one', ['fr-FR', 'he', 'en'], 'he'],
    ['English when none is supported', ['fr-FR', 'de'], 'en'],
  ])('starts in %s when nothing is saved', (_description, languages, expected) => {
    start(fakeClient().client, undefined, memoryPreferences(), languages);
    expect(document.documentElement.lang).toBe(expected);
  });

  it('ignores a saved language the app no longer has', () => {
    start(fakeClient().client, undefined, memoryPreferences({ 'ui-locale': 'xx' }), ['en']);
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches the theme, and remembers it', async () => {
    const preferences = memoryPreferences();
    const element = start(fakeClient().client, undefined, preferences);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    const dark = element.querySelector<HTMLInputElement>('input[value="dark"]');
    if (dark === null) throw new Error('no dark theme option');
    dark.click();
    await flushPromises();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(preferences.get('theme')).toBe('dark');

    unmount?.();
    start(fakeClient().client, undefined, preferences);
    expect(document.documentElement.dataset.theme).toBe('dark');
    const system = document.querySelector<HTMLInputElement>('input[value="system"]');
    system?.click();
    await flushPromises();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('labels every theme choice for screen readers', () => {
    const element = start(fakeClient().client);
    const labels = [...element.querySelectorAll('.theme-option')].map((label) =>
      label.textContent.trim(),
    );
    expect(labels).toEqual(['Match the system', 'Light', 'Dark']);
  });

  it('can start in Hebrew', () => {
    const { client } = fakeClient();
    const element = start(client, 'he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(element.textContent).toContain('פתחו תיקיית פרויקט');
  });
});
