// SPDX-License-Identifier: GPL-3.0-or-later
// The whole UI through its real entry point (mountApp), with a fake client instead of IPC.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences, type PreferenceStore } from './preferences';
import { documents, error, fakeClient, languages, pairFor, summary } from './test-support';

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
const pageNames = (element: Element) =>
  pageButtons(element).map((b) => b.querySelector('bdi')?.textContent);

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
    expect(pageNames(element)).toEqual(['guide/getting-started', 'index']);
    expect(pageButtons(element)[0]?.getAttribute('aria-current')).toBe('page');
    const [source, target] = panes(element);
    expect(paneName(source)).toBe('English · source');
    expect(source?.textContent).toContain('en/guide/getting-started.md');
    expect(target?.getAttribute('dir')).toBe('rtl');
    expect(paneName(target)).toBe('עברית · translation');
    expect(target?.textContent).toContain('he/guide/getting-started.md');
  });

  it("shows each page's source and translation as written, block by block", async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
      read: {
        'guide/getting-started': {
          ok: true,
          value: {
            key: 'guide/getting-started',
            source: {
              path: 'en/guide/getting-started.md',
              text: '# Start\n\nRun `x`.\n',
              blocks: [
                { kind: 'heading', start: 0, end: 7, depth: 1 },
                { kind: 'paragraph', start: 9, end: 17 },
              ],
              inline: [
                { kind: 'markup', start: 0, end: 1 },
                { kind: 'markup', start: 13, end: 14 },
                { kind: 'code', start: 14, end: 15 },
                { kind: 'markup', start: 15, end: 16 },
              ],
            },
            target: {
              path: 'he/guide/getting-started.md',
              text: '```sh\nnpm i\n```\n',
              blocks: [{ kind: 'code', start: 0, end: 15 }],
              inline: [],
            },
          },
        },
      },
    });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    const [source, target] = panes(element);
    const blocks = [...(source?.querySelectorAll('.markdown-block') ?? [])];
    expect(blocks.map((b) => b.textContent)).toEqual(['# Start', 'Run `x`.']);
    expect(blocks[0]?.classList.contains('markdown-h1')).toBe(true);
    expect(blocks[1]?.querySelector('.markdown-span-code')?.textContent).toBe('x');
    // Inline code is an isolated left-to-right run; punctuation-only markup isn't.
    expect(blocks[1]?.querySelector('.markdown-span-code')?.getAttribute('dir')).toBe('ltr');
    expect(blocks[1]?.querySelector('.markdown-span-markup')?.hasAttribute('dir')).toBe(false);
    // A code block reads left to right even in the right-to-left pane, line by line: its contents
    // aren't one isolated run (that would force Hebrew lines in a code sample left to right too).
    expect(target?.querySelector('.markdown-code')?.getAttribute('dir')).toBe('ltr');
    expect(target?.querySelector('.markdown-code span[dir]')).toBeNull();
  });

  it('says so when a page has no translation yet', async () => {
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
      read: {
        'guide/getting-started': { ok: true, value: pairFor('guide/getting-started', 'Hi\n') },
      },
    });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    const [source, target] = panes(element);
    expect(source?.textContent).toContain('Hi');
    expect(target?.textContent).toContain("This page isn't translated yet.");
  });

  it('shows a reading error in place of the panes', async () => {
    const failure = error('workspace.document-unreadable', {
      file: 'he/guide/getting-started.md',
      problem: 'files.not-utf8',
    });
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
      read: { 'guide/getting-started': { ok: false, error: failure } },
    });
    const element = start(client);
    button(element, 'Open folder…').click();
    await flushPromises();
    expect(panes(element)).toHaveLength(0);
    expect(element.querySelector('article [role="alert"]')?.textContent).toContain(
      "The file he/guide/getting-started.md can't be read (files.not-utf8).",
    );
  });

  it('counts the pages that have a translation, and gives each page its status', async () => {
    const element = await openedApp();
    expect(element.querySelector('nav')?.textContent).toContain('With a translation: 1 of 2');
    expect(
      pageButtons(element).map((b) => b.querySelector('.visually-hidden')?.textContent.trim()),
    ).toEqual(['Not translated yet', 'Has a translation']);
    expect(
      pageButtons(element).map((b) =>
        b.querySelector('.pages-status')?.getAttribute('data-status'),
      ),
    ).toEqual(['missing', 'started']);
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
    expect(pageNames(element)).toEqual(['guide/getting-started']);
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
    const [source, target] = panes(element).map((pane) => pane.querySelector('header'));
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

describe('the target-language picker', () => {
  const noTarget = { ...summary, targetLocale: null };
  const dialog = () => document.querySelector('dialog');
  const search = () => dialog()?.querySelector<HTMLInputElement>('input[role="combobox"]');
  const options = () => [...(dialog()?.querySelectorAll('[role="option"]') ?? [])];
  const optionTags = () => options().map((o) => o.querySelector('.picker-tag')?.textContent);
  const headings = () =>
    [...(dialog()?.querySelectorAll('.picker-heading') ?? [])].map((h) => h.textContent.trim());

  async function openWithoutTarget(answers: Parameters<typeof fakeClient>[0] = {}) {
    const fake = fakeClient({
      open: [{ ok: true, value: noTarget }],
      list: [{ ok: true, value: documents }],
      ...answers,
    });
    const preferences = memoryPreferences();
    const element = start(fake.client, undefined, preferences);
    button(element, 'Open folder…').click();
    await flushPromises();
    return { ...fake, element, preferences };
  }

  async function type(text: string) {
    const input = search();
    if (input === null || input === undefined) throw new Error('no search box');
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
  }

  async function press(key: string) {
    search()?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await flushPromises();
  }

  it('opens by itself for a project without a target, with the search box focused', async () => {
    const { element } = await openWithoutTarget();
    expect(dialog()?.open).toBe(true);
    expect(document.activeElement).toBe(search());
    expect(dialog()?.getAttribute('aria-labelledby')).toBe('picker-title');
    expect(document.getElementById('picker-title')?.textContent).toBe(
      'Choose the translation language',
    );
    expect(headings()).toEqual(['In this project', 'Suggested']);
    expect(optionTags()).toEqual(['he', 'fr']);
    expect(panes(element)).toHaveLength(0);
  });

  it('shows each language by its own name, with its lang and dir, then its name and code', () =>
    openWithoutTarget().then(() => {
      const [hebrew] = options();
      const ownName = hebrew?.querySelector('.picker-own-name');
      expect(ownName?.textContent).toBe('עברית');
      expect([ownName?.getAttribute('lang'), ownName?.getAttribute('dir')]).toEqual(['he', 'rtl']);
      expect(hebrew?.querySelector('.picker-name')?.textContent).toBe('Hebrew');
      expect(hebrew?.querySelector('.picker-tag [dir]')?.getAttribute('dir')).toBe('ltr');
    }));

  it("doesn't mark a name in the interface language as the language's own", async () => {
    await openWithoutTarget({
      suggest: { ok: true, value: { inProject: [languages.lantern], recent: [], suggested: [] } },
    });
    const ownName = options()[0]?.querySelector('.picker-own-name');
    expect(ownName?.textContent).toBe('art-x-lantern');
    expect(ownName?.hasAttribute('lang')).toBe(false);
  });

  it('chooses a language, lists the pages for it, remembers it, and closes', async () => {
    const { element, calls, preferences } = await openWithoutTarget({
      list: [{ ok: true, value: documents }],
    });
    (options()[1] as HTMLElement).click();
    await flushPromises();
    const chosenAt = calls.indexOf('chooseTargetLocale:p-1:fr');
    expect(chosenAt).toBeGreaterThan(-1);
    expect(calls.slice(chosenAt, chosenAt + 3)).toEqual([
      'chooseTargetLocale:p-1:fr',
      'listSourceDocuments:p-1',
      'readDocumentPair:p-1:guide/getting-started',
    ]);
    expect(dialog()?.open).toBe(false);
    const target = element.querySelector('.header-target [lang]');
    expect([target?.getAttribute('lang'), target?.textContent]).toEqual(['fr', 'Français']);
    expect(panes(element)).toHaveLength(2);
    expect(preferences.get('recent-target-languages')).toBe('["fr"]');
  });

  it('searches as you type, and chooses with the arrow keys and Enter', async () => {
    const { calls } = await openWithoutTarget();
    await type('a');
    expect(calls).toContain('searchTargetLanguages:p-1:en:a');
    expect(optionTags()).toEqual(['ar', 'art-x-lantern']);
    const input = search();
    expect(input?.getAttribute('aria-activedescendant')).toBe('language-option-ar');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    await press('ArrowDown');
    expect(input?.getAttribute('aria-activedescendant')).toBe('language-option-art-x-lantern');
    await press('ArrowDown');
    expect(input?.getAttribute('aria-activedescendant')).toBe('language-option-ar');
    await press('ArrowUp');
    await press('Enter');
    expect(calls).toContain('chooseTargetLocale:p-1:art-x-lantern');
  });

  it('says when nothing matches, and how to add a language', async () => {
    await openWithoutTarget();
    await type('zzz');
    expect(options()).toHaveLength(0);
    expect(dialog()?.querySelector('.picker-none')?.textContent).toContain(
      'No language matches "zzz"',
    );
    expect(dialog()?.querySelector('[role="status"]')?.textContent).toContain('"zzz"');
  });

  it('closes on Cancel without choosing, and the page offers to choose again', async () => {
    const { element, calls } = await openWithoutTarget();
    button(dialog() ?? element, 'Cancel').click();
    await flushPromises();
    expect(dialog()?.open).toBe(false);
    expect(calls.some((call) => call.startsWith('chooseTargetLocale'))).toBe(false);
    expect(element.querySelector('.app-notice')?.textContent).toContain('Choose the language');
    button(
      element.querySelector('.app-notice') ?? element,
      'Choose the translation language',
    ).click();
    await flushPromises();
    expect(dialog()?.open).toBe(true);
  });

  it('shows why a choice failed, and stays open', async () => {
    await openWithoutTarget({
      choose: {
        ok: false,
        error: error('workspace.config-unwritable', {
          file: 'paperl10n.config.json',
          problem: 'files.unwritable',
        }),
      },
    });
    (options()[0] as HTMLElement).click();
    await flushPromises();
    expect(dialog()?.open).toBe(true);
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      "The config file paperl10n.config.json can't be saved (files.unwritable).",
    );
  });

  it('opens from the header to change the target, marking the current one', async () => {
    const element = await openedApp();
    const change = element.querySelector<HTMLButtonElement>('.header-target');
    expect(change?.getAttribute('aria-label')).toBe('Translation language: עברית. Change it');
    expect(change?.getAttribute('aria-haspopup')).toBe('dialog');
    change?.click();
    await flushPromises();
    expect(dialog()?.open).toBe(true);
    expect(options()[0]?.querySelector('.picker-current')?.textContent).toContain('(current)');
    expect(options()[1]?.querySelector('.picker-current')).toBeNull();
  });

  it('sends the recent picks and the interface language with the suggestions request', async () => {
    const { client, calls } = fakeClient({ open: [{ ok: true, value: noTarget }] });
    const element = start(
      client,
      'he',
      memoryPreferences({ 'recent-target-languages': '["ar","de"]' }),
    );
    button(element, 'פתיחת תיקייה…').click();
    await flushPromises();
    expect(calls).toContain('suggestTargetLanguages:p-1:he:ar,de');
    expect(document.getElementById('picker-title')?.textContent).toBe('בחירת שפת התרגום');
  });
});
