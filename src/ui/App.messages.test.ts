// SPDX-License-Identifier: GPL-3.0-or-later
// The message editor (M4 C6b), through the real entry point with a fake client: opening a row,
// its documentation and editor, checks in main as the translation is written, and moving between
// messages from the keyboard.
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  ErrorDto,
  MessageCheckDto,
  PaperLionApi,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
/** The editors asked to take focus, in order. */
let focused: EditorView[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // happy-dom fires `selectionchange` synchronously, inside CodeMirror's update, so the editor
  // can't really take focus here (as in App.links.test.ts): record who asked instead.
  focused = [];
  vi.spyOn(EditorView.prototype, 'focus').mockImplementation(function (this: EditorView) {
    focused.push(this);
  });
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
  extra: Partial<CatalogMessageDto> = {},
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
  ...extra,
});

const items = message('app-items', 'translated', 'יש לך $1 פריטים', {
  source: 'You have $1 items',
  documentation: 'How many items the cart has.\n$1: the number',
  sourceTokens: [{ kind: 'parameter', start: 9, end: 11 }],
  translationTokens: [{ kind: 'parameter', start: 6, end: 8 }],
  context: null,
  sourceForms: null,
  translationForms: null,
  needsReview: false,
  previousSource: null,
});
const messages = [
  items,
  message('app-save', 'missing', null),
  message('app-open', 'translated', 'פתיחה'),
  message('app-close', 'outdated', 'סגירה'),
  message('app-quit', 'missing', null),
];

function detail(key: string, list: CatalogMessageDto[] = messages): CatalogDetailDto {
  return {
    key,
    sourcePath: `${key}/en.json`,
    targetPath: `${key}/he.json`,
    targetExists: true,
    documentationPath: `${key}/qqq.json`,
    messages: list,
    notInSource: [],
    documentationProblem: null,
    pluralForms: [],
    draft: null,
    statusFile: { exists: true, problem: null },
  };
}

type Check = (request: {
  key: string;
  text: string;
  forms?: readonly string[];
}) => Promise<Result<MessageCheckDto, ErrorDto>>;
/** Main's answer with no warnings, and each `$n` a token (as the real scanner finds them). */
const noWarnings: Check = ({ text }) =>
  Promise.resolve({
    ok: true,
    value: {
      tokens: [...text.matchAll(/\$\d+/g)].map((match) => ({
        kind: 'parameter' as const,
        start: match.index,
        end: match.index + match[0].length,
      })),
      warnings: [],
      forms: null,
    },
  });

async function opened(
  options: { check?: Check; catalogs?: Record<string, CatalogDetailDto> } = {},
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
          hasDraft: false,
          progress: null,
          problem: null,
        })),
        statusFile: { exists: true, problem: null },
      },
    },
    readCatalog: Object.fromEntries(
      Object.entries(catalogs).map(([key, value]) => [key, { ok: true as const, value }]),
    ),
  });
  const asked: { key: string; text: string; forms?: readonly string[] }[] = [];
  const check = options.check ?? noWarnings;
  const checking: PaperLionApi = {
    ...client,
    checkMessage: (request) => {
      calls.push(`checkMessage:${request.catalog}:${request.key}`);
      asked.push({
        key: request.key,
        text: request.text,
        ...(request.forms === undefined ? {} : { forms: request.forms }),
      });
      return check(request);
    },
  };
  const element = document.createElement('div');
  document.body.append(element);
  const app = mountApp(element, checking, {
    preferences: memoryPreferences(),
    systemLanguages: ['en-US'],
  });
  unmount = () => {
    app.unmount();
  };
  button(element, 'Open folder…').click();
  await settle();
  return { element, calls, asked };
}

/** Promises, Vue's updates, and the checks' timers at 0. */
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
const rowButton = (element: Element, key: string) => {
  const found = row(element, key).querySelector<HTMLButtonElement>('.catalog-row-button');
  if (found === null) throw new Error(`no row button "${key}"`);
  return found;
};
const openKey = (element: Element) =>
  element.querySelector<HTMLElement>('tr[data-open]')?.dataset.key ?? null;
function editor(element: Element): EditorView {
  const content = element
    .querySelector('tr[data-open] .message-editor')
    ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
  const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
  if (view === null) throw new Error('no message editor');
  return view;
}
const press = async (element: Element, key: string, modifiers: KeyboardEventInit = {}) => {
  runScopeHandlers(
    editor(element),
    new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }),
    'editor',
  );
  await settle();
};
const warnings = (element: Element) =>
  [...element.querySelectorAll('tr[data-open] .catalog-warnings li')].map((item) =>
    item.textContent.trim(),
  );
const cellText = (element: Element, key: string, index: number) =>
  row(element, key).children[index]?.textContent.replace(/\s+/g, ' ').trim();

describe('the message editor', () => {
  it('opens a row with its whole source, its documentation, and an editor for the translation', async () => {
    const { element, asked } = await opened();
    expect(rowButton(element, 'app-items').getAttribute('aria-expanded')).toBe('false');
    row(element, 'app-items').click();
    await flushPromises();
    // Its token, as read, is marked and isolated before main is asked.
    expect(editor(element).contentDOM.querySelector('.cm-msg-isolate')?.textContent).toBe('$1');
    expect(asked).toEqual([]);
    await settle();
    expect(openKey(element)).toBe('app-items');
    expect(rowButton(element, 'app-items').getAttribute('aria-expanded')).toBe('true');
    const [, source] = row(element, 'app-items').children;
    // Not clamped, with the documentation under it.
    expect(source?.querySelector('.catalog-clamp')).toBeNull();
    const documentation = source?.querySelector('.catalog-documentation');
    expect(documentation?.querySelector('h3')?.textContent).toBe('Documentation');
    // In the source cell's language and direction; its title in the interface's.
    expect(documentation?.hasAttribute('lang')).toBe(false);
    expect(documentation?.querySelector('p')?.getAttribute('dir')).toBe('auto');
    const title = documentation?.querySelector('h3');
    expect([title?.getAttribute('lang'), title?.getAttribute('dir')]).toEqual(['en', 'ltr']);
    expect(documentation?.querySelector('p')?.textContent.trim()).toBe(
      'How many items the cart has.\n$1: the number',
    );
    const view = editor(element);
    expect(view.state.doc.toString()).toBe('יש לך $1 פריטים');
    expect(view.contentDOM.getAttribute('lang')).toBe('he');
    expect(view.contentDOM.getAttribute('dir')).toBe('rtl');
    expect(view.contentDOM.getAttribute('aria-label')).toBe('Translation of app-items');
    expect(focused.at(-1)).toBe(view);
    // Checked in main as soon as it opened.
    expect(asked).toEqual([{ key: 'app-items', text: 'יש לך $1 פריטים' }]);
  });

  it('says when a message has no documentation, and opens an empty editor for a missing one', async () => {
    const { element } = await opened();
    row(element, 'app-save').click();
    await settle();
    expect(row(element, 'app-save').querySelector('.catalog-documentation')?.textContent).toContain(
      'This message has no documentation.',
    );
    expect(editor(element).state.doc.toString()).toBe('');
  });

  it('checks the translation 0.2 s after typing pauses, and shows the warnings and marks', async () => {
    const check: Check = ({ text }) =>
      Promise.resolve({
        ok: true,
        value: text.includes('$2')
          ? {
              tokens: [
                { kind: 'parameter', start: text.indexOf('$2'), end: text.indexOf('$2') + 2 },
              ],
              warnings: [
                { kind: 'missing', token: 'parameter', value: '$1' },
                { kind: 'unexpected', token: 'parameter', value: '$2' },
              ],
              forms: null,
            }
          : { tokens: [], warnings: [], forms: null },
      });
    const { element, asked } = await opened({ check });
    row(element, 'app-items').click();
    await settle();
    expect(element.querySelector('tr[data-open] .catalog-warnings')).toBeNull();
    const view = editor(element);
    view.dispatch({ changes: { from: 6, to: 8, insert: '$' } });
    await vi.advanceTimersByTimeAsync(150);
    view.dispatch({ changes: { from: 7, insert: '2' } });
    await vi.advanceTimersByTimeAsync(199);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(asked.at(-1)).toEqual({ key: 'app-items', text: 'יש לך $2 פריטים' });
    expect(element.querySelector('tr[data-open] .catalog-warnings p')?.textContent).toBe(
      'Worth checking',
    );
    expect(warnings(element)).toEqual([
      'A parameter only in the source: ⁨$1⁩',
      'A parameter only here: ⁨$2⁩',
    ]);
    expect(view.contentDOM.querySelector('.cm-msg-isolate')?.textContent).toBe('$2');
  });

  it('keeps an edit while the catalog is open, shown in its row, and back in the editor', async () => {
    const { element } = await opened();
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: 'שמירה $1' } });
    // Main's tokens for the text as written come with it to the row.
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    await press(element, 'Escape');
    expect(openKey(element)).toBeNull();
    expect(row(element, 'app-save').querySelector('bdi.message-token')?.textContent).toBe('$1');
    expect(row(element, 'app-save').children[2]?.querySelector('.catalog-clamp')?.textContent).toBe(
      'שמירה $1',
    );
    const edited = row(element, 'app-save').querySelector('.catalog-edited');
    expect(edited?.textContent.trim()).toBe('Edited, not saved yet');
    expect([edited?.getAttribute('lang'), edited?.getAttribute('dir')]).toEqual(['en', 'ltr']);
    // Escape gives the focus back to the row.
    expect(document.activeElement).toBe(rowButton(element, 'app-save'));

    rowButton(element, 'app-save').click();
    await settle();
    expect(editor(element).state.doc.toString()).toBe('שמירה $1');
  });

  it('counts a translation written back as the file’s as no edit, and an emptied one as none', async () => {
    const { element } = await opened();
    row(element, 'app-open').click();
    await settle();
    const view = editor(element);
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    view.dispatch({ changes: { from: 0, to: 1 } });
    await press(element, 'Escape');
    expect(cellText(element, 'app-open', 2)).toBe('פתיחה');

    row(element, 'app-open').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, to: 5 } });
    await press(element, 'Escape');
    expect(cellText(element, 'app-open', 2)).toBe('Edited, not saved yet');
    // Nothing to show but the note: an emptied translation is none.
    expect(row(element, 'app-open').children[2]?.querySelector('.catalog-clamp')).toBeNull();
  });

  it('moves between messages from the keyboard, and says when there is nothing further', async () => {
    const { element } = await opened();
    row(element, 'app-items').click();
    await settle();
    await press(element, 'ArrowDown', { altKey: true });
    expect(openKey(element)).toBe('app-save');
    expect(focused.at(-1)).toBe(editor(element));
    await press(element, 'ArrowUp', { altKey: true });
    expect(openKey(element)).toBe('app-items');
    await press(element, 'ArrowUp', { altKey: true });
    expect(openKey(element)).toBe('app-items');
    expect(element.querySelector('tr[data-open] [role="status"]')?.textContent).toBe(
      'This is the first message.',
    );
  });

  it('moves to the messages needing work, past those already edited', async () => {
    const { element } = await opened();
    row(element, 'app-items').click();
    await settle();
    await press(element, 'ArrowDown', { altKey: true, shiftKey: true });
    expect(openKey(element)).toBe('app-save');
    editor(element).dispatch({ changes: { from: 0, insert: 'שמירה' } });
    await press(element, 'ArrowDown', { altKey: true, shiftKey: true });
    expect(openKey(element)).toBe('app-close');
    await press(element, 'ArrowUp', { altKey: true, shiftKey: true });
    // app-save was written, so it no longer needs work: none before.
    expect(openKey(element)).toBe('app-close');
    expect(element.querySelector('tr[data-open] [role="status"]')?.textContent).toBe(
      'No message before this one needs work.',
    );
    await press(element, 'ArrowDown', { altKey: true, shiftKey: true });
    expect(openKey(element)).toBe('app-quit');
    await press(element, 'ArrowDown', { altKey: true, shiftKey: true });
    expect(element.querySelector('tr[data-open] [role="status"]')?.textContent).toBe(
      'No message after this one needs work.',
    );
    await press(element, 'ArrowDown', { altKey: true });
    expect(element.querySelector('tr[data-open] [role="status"]')?.textContent).toBe(
      'This is the last message.',
    );
  });

  it('moves and closes with buttons too, each naming its keys', async () => {
    const { element } = await opened();
    rowButton(element, 'app-items').click();
    await settle();
    expect(button(element, 'Next').getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown');
    // The reminder of the keys, each isolated so a right-to-left sentence keeps "Alt+↓" whole.
    expect(
      [...element.querySelectorAll('tr[data-open] .catalog-note')].at(-1)?.textContent.trim(),
    ).toBe(
      '⁨Alt+↓⁩ and ⁨Alt+↑⁩ move between messages; with ⁨Shift⁩, between those needing work. ⁨Esc⁩ closes.',
    );
    button(element, 'Next').click();
    await settle();
    expect(openKey(element)).toBe('app-save');
    button(element, 'Previous').click();
    await settle();
    expect(openKey(element)).toBe('app-items');
    button(element, 'Next needing work').click();
    await settle();
    expect(openKey(element)).toBe('app-save');
    button(element, 'Close').click();
    await settle();
    expect(openKey(element)).toBeNull();
    expect(document.activeElement).toBe(rowButton(element, 'app-save'));
    // The row's own button opens it and closes it again.
    rowButton(element, 'app-close').click();
    await settle();
    expect(openKey(element)).toBe('app-close');
    rowButton(element, 'app-close').click();
    await settle();
    expect(openKey(element)).toBeNull();
  });

  it('starts another catalog, once the edits are dropped, with no message open and no edits', async () => {
    const { element } = await opened({
      catalogs: { i18n: detail('i18n'), api: detail('api') },
    });
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: 'שמירה' } });
    await settle();
    const api = [...element.querySelectorAll('nav li button')].find(
      (candidate) => candidate.querySelector('bdi')?.textContent === 'api',
    );
    if (!(api instanceof HTMLButtonElement)) throw new Error('no api catalog');
    api.click();
    await settle();
    // Asked first (App.catalog-saving.test.ts has the rest): not saving drops the edits.
    button(element, "Don't save").click();
    await settle();
    expect(element.querySelector('.catalog-title')?.textContent).toBe('api');
    expect(openKey(element)).toBeNull();
    expect(cellText(element, 'app-save', 2)).toBe('');
  });

  it('scrolls a long catalog to the message it moves to, all of it in view', async () => {
    // happy-dom lays nothing out: rows of 72 px, the open one 300 px, and an 800 px view.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.matches('tr[data-open]')) return 300;
      return this.matches('tr[data-row]') ? 72 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('catalog-scroll') ? 800 : 0;
    });
    const many = Array.from({ length: 1000 }, (_, i) =>
      message(`msg-${String(i)}`, i === 900 ? 'missing' : 'translated', i === 900 ? null : 'x'),
    );
    const { element } = await opened({ catalogs: { i18n: detail('i18n', many) } });
    row(element, 'msg-0').click();
    await settle();
    await press(element, 'ArrowDown', { altKey: true, shiftKey: true });
    expect(openKey(element)).toBe('msg-900');
    expect(focused.at(-1)).toBe(editor(element));
    // Row 900 starts at 64,800 px and, open, ends 300 px lower: its bottom at the view's bottom.
    const box = element.querySelector<HTMLElement>('.catalog-scroll');
    expect(box?.scrollTop).toBe(900 * 72 + 300 - 800);
    // Rows 885–908 rendered (8 more each side); below them, the rest at 72 px each.
    const spacers = [...element.querySelectorAll<HTMLElement>('.catalog-spacer td')].map(
      (cell) => cell.style.blockSize,
    );
    expect(spacers).toEqual([`${String(885 * 72)}px`, `${String(91 * 72)}px`]);
  });
});

describe('the plural and gender preview', () => {
  /** Main's answer: each `$n`, and each `{{PLURAL:…}}` or `{{GENDER:…}}` without nesting. */
  const choices: Check = ({ text }) =>
    Promise.resolve({
      ok: true,
      value: {
        tokens: [...text.matchAll(/\{\{(PLURAL|GENDER):[^}]*\}\}|\$\d+/g)].map((match) => ({
          kind:
            match[1] === 'PLURAL'
              ? ('plural' as const)
              : match[1] === 'GENDER'
                ? ('gender' as const)
                : ('parameter' as const),
          start: match.index,
          end: match.index + match[0].length,
        })),
        warnings: [],
        forms: null,
      },
    });
  const plural = message('app-pages', 'translated', 'יש {{PLURAL:$1|דף אחד|שני דפים|$1 דפים}}', {
    source: 'There {{PLURAL:$1|is one page|are $1 pages}}',
    translationTokens: [{ kind: 'plural', start: 3, end: 37 }],
    context: null,
    sourceForms: null,
    translationForms: null,
    needsReview: false,
    previousSource: null,
  });
  const preview = (element: Element) =>
    [...element.querySelectorAll('tr[data-open] .message-preview dl > div')].map((item) => [
      item.querySelector('dt')?.textContent.trim(),
      item.querySelector('dd')?.textContent.trim(),
    ]);

  it('shows each plural form of the target language as soon as a message opens', async () => {
    const { element, asked } = await opened({
      check: choices,
      catalogs: { i18n: detail('i18n', [plural, ...messages]) },
    });
    row(element, 'app-pages').click();
    await flushPromises();
    // From the tokens as read, before main answers.
    expect(asked).toEqual([]);
    expect(element.querySelector('tr[data-open] .message-preview h3')?.textContent.trim()).toBe(
      'Preview',
    );
    expect(preview(element)).toEqual([
      ['For ⁨1⁩ (⁨one⁩)', 'יש דף אחד'],
      ['For ⁨2⁩ (⁨two⁩)', 'יש שני דפים'],
      ['For ⁨3⁩ (⁨other⁩)', 'יש 3 דפים'],
    ]);
    const text = element.querySelector('tr[data-open] .message-preview dd');
    expect([text?.getAttribute('lang'), text?.getAttribute('dir')]).toEqual(['he', 'rtl']);
  });

  it('follows the translation as main checks it, and shows nothing without a plural or gender', async () => {
    const { element } = await opened({ check: choices });
    row(element, 'app-save').click();
    await settle();
    expect(element.querySelector('tr[data-open] .message-preview')).toBeNull();
    editor(element).dispatch({ changes: { from: 0, insert: '{{GENDER:|שמר|שמרה|שמר/ה}}' } });
    await settle();
    // Not before main has found the gender.
    expect(element.querySelector('tr[data-open] .message-preview')).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(preview(element)).toEqual([
      ['Male', 'שמר'],
      ['Female', 'שמרה'],
      ['Gender not known', 'שמר/ה'],
    ]);
  });

  it("says when banana-i18n can't read the translation", async () => {
    const { element } = await opened({ check: choices });
    row(element, 'app-save').click();
    await settle();
    editor(element).dispatch({ changes: { from: 0, insert: '{{PLURAL:$1|a|b}} {{PLURAL:$1|' } });
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(preview(element)).toEqual([]);
    expect(element.querySelector('tr[data-open] .message-preview')?.textContent).toContain(
      "No preview: banana-i18n can't read this translation as it's written.",
    );
  });
});

describe('plural forms, review marks, and context', () => {
  const lamps = message('%d lamp', 'translated', 'מנורה', {
    source: '%d lamp',
    sourceTokens: [{ kind: 'parameter', start: 0, end: 2 }],
    sourceForms: [
      { text: '%d lamp', tokens: [{ kind: 'parameter', start: 0, end: 2 }] },
      { text: '%d lamps', tokens: [{ kind: 'parameter', start: 0, end: 2 }] },
    ],
    translationForms: [
      { text: 'מנורה', tokens: [] },
      { text: 'שתי מנורות', tokens: [] },
      { text: '%d מנורות', tokens: [{ kind: 'parameter', start: 0, end: 2 }] },
    ],
  });
  const fuzzy = message('Lantern', 'outdated', 'פנסים', {
    source: 'Lantern',
    needsReview: true,
    previousSource: 'Lanterns',
  });
  const marked = message('Dim', 'outdated', 'עמעום', { source: 'Dim', needsReview: true });
  const open = message('menu\u0004Open', 'missing', null, { source: 'Open', context: 'menu' });
  const gettext: CatalogDetailDto = {
    ...detail('po', [lamps, fuzzy, marked, open]),
    pluralForms: [{ samples: [1] }, { samples: [2] }, { samples: [0, 3, 4, 5] }],
  };
  /** Main's answer for forms: each `%d` a token, and the last form warned when no form has one. */
  const formsCheck: Check = ({ forms }) =>
    Promise.resolve({
      ok: true,
      value: {
        tokens: [],
        // As main answers: the text's check is the first form's (shown under it, not again).
        warnings:
          forms === undefined ? [] : [{ kind: 'unbalanced' as const, brackets: '{}' as const }],
        forms:
          forms?.map((form, index) => ({
            tokens: [...form.matchAll(/%d/g)].map((m) => ({
              kind: 'parameter' as const,
              start: m.index,
              end: m.index + 2,
            })),
            warnings:
              index === forms.length - 1 && !forms.some((f) => f.includes('%d'))
                ? [{ kind: 'missing' as const, token: 'parameter' as const, value: '%d' }]
                : [],
          })) ?? null,
      },
    });
  const forms = (element: Element) =>
    [...element.querySelectorAll('tr[data-open] .catalog-form')].map((form) => {
      const content = form
        .querySelector('.message-editor')
        ?.shadowRoot?.querySelector<HTMLElement>('.cm-content');
      const view =
        content === null || content === undefined ? null : EditorView.findFromDOM(content);
      return {
        label: form.querySelector('.catalog-form-label')?.textContent.trim(),
        text: view?.state.doc.toString(),
        name: view?.contentDOM.getAttribute('aria-label'),
        warnings: [...form.querySelectorAll('.catalog-form-warnings li')].map((li) =>
          li.textContent.trim(),
        ),
        view,
      };
    });

  it('opens a plural with a field per form of the language, each labeled by its counts', async () => {
    const { element } = await opened({ check: formsCheck, catalogs: { po: gettext } });
    row(element, '%d lamp').click();
    await settle();
    expect(forms(element).map(({ label, text, name }) => [label, text, name])).toEqual([
      ['For ⁨1⁩', 'מנורה', 'Translation of %d lamp, For ⁨1⁩'],
      ['For ⁨2⁩', 'שתי מנורות', 'Translation of %d lamp, For ⁨2⁩'],
      ['For ⁨0, 3, 4, 5…⁩', '%d מנורות', 'Translation of %d lamp, For ⁨0, 3, 4, 5…⁩'],
    ]);
    // The first form takes the focus; there's no single editor besides.
    expect(focused.at(-1)).toBe(forms(element)[0]?.view);
    expect(element.querySelectorAll('tr[data-open] .message-editor')).toHaveLength(3);
    const source = [...element.querySelectorAll('tr[data-open] .catalog-source-forms > div')].map(
      (form) => [
        form.querySelector('dt')?.textContent.trim(),
        form.querySelector('dd')?.textContent,
      ],
    );
    expect(source).toEqual([
      ['Singular', '%d lamp'],
      ['Plural', '%d lamps'],
    ]);
  });

  it('checks every form as one is written, shows each form’s warnings, and saves them all', async () => {
    const { element, asked, calls } = await opened({
      check: formsCheck,
      catalogs: { po: gettext },
    });
    row(element, '%d lamp').click();
    await settle();
    expect(asked.at(-1)).toEqual({
      key: '%d lamp',
      text: 'מנורה',
      forms: ['מנורה', 'שתי מנורות', '%d מנורות'],
    });
    const last = forms(element)[2]?.view;
    last?.dispatch({ changes: { from: 0, to: last.state.doc.length, insert: 'הרבה מנורות' } });
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(asked.at(-1)?.forms).toEqual(['מנורה', 'שתי מנורות', 'הרבה מנורות']);
    expect(forms(element).map((form) => form.warnings)).toEqual([
      [],
      [],
      ['A parameter only in the source: ⁨%d⁩'],
    ]);
    // A form's tokens marked from main's answer for its text.
    const first = forms(element)[0]?.view;
    first?.dispatch({ changes: { from: 0, insert: '%d ' } });
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(first?.contentDOM.querySelector('.cm-msg-isolate')?.textContent).toBe('%d');
    first?.dispatch({ changes: { from: 0, to: 3, insert: '' } });
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    // Only the plural's own warnings, under each form: none for the message as a whole.
    expect(element.querySelector('tr[data-open] .catalog-warnings')).toBeNull();
    element.querySelector<HTMLButtonElement>('.catalog-save button')?.click();
    await settle();
    const saved = calls.find((call) => call.startsWith('saveCatalog:'));
    expect(saved).toContain(
      JSON.stringify([
        {
          key: '%d lamp',
          text: 'מנורה',
          forms: ['מנורה', 'שתי מנורות', 'הרבה מנורות'],
          base: 'מנורה',
          baseForms: ['מנורה', 'שתי מנורות', '%d מנורות'],
          source: '%d lamp',
        },
      ]),
    );
  });

  it('gives a plural as many fields as its language has forms, and a single message one editor', async () => {
    const untranslated = message('%d file', 'missing', null, {
      source: '%d file',
      sourceForms: [
        { text: '%d file', tokens: [] },
        { text: '%d files', tokens: [] },
      ],
    });
    const { element } = await opened({
      check: formsCheck,
      catalogs: { po: { ...gettext, messages: [untranslated, fuzzy] } },
    });
    row(element, '%d file').click();
    await settle();
    expect(forms(element).map((form) => form.text)).toEqual(['', '', '']);
    row(element, 'Lantern').click();
    await settle();
    expect(forms(element)).toEqual([]);
    expect(element.querySelectorAll('tr[data-open] .message-editor')).toHaveLength(1);
  });

  it('numbers the forms when the language’s aren’t known', async () => {
    const { element } = await opened({
      check: formsCheck,
      catalogs: { po: { ...gettext, pluralForms: [] } },
    });
    row(element, '%d lamp').click();
    await settle();
    expect(forms(element).map((form) => form.label)).toEqual(['Form 1', 'Form 2', 'Form 3']);
    // A translation without a review mark has no review.
    expect(element.querySelector('tr[data-open] .catalog-review')).toBeNull();
  });

  it('counts forms written back as the file’s as no edit', async () => {
    const { element } = await opened({ check: formsCheck, catalogs: { po: gettext } });
    row(element, '%d lamp').click();
    await settle();
    const second = forms(element)[1]?.view;
    second?.dispatch({ changes: { from: 0, insert: 'x' } });
    await settle();
    expect(row(element, '%d lamp').querySelector('.catalog-edited')).toBeNull();
    expect(element.querySelector('.catalog-save-status')?.textContent).not.toBe('');
    second?.dispatch({ changes: { from: 0, to: 1, insert: '' } });
    await settle();
    expect(element.querySelector('.catalog-save-status')?.textContent).toBe('');
  });

  it('says a translation needs review, with what changed in its source when known', async () => {
    const { element } = await opened({ check: formsCheck, catalogs: { po: gettext } });
    row(element, 'Lantern').click();
    await settle();
    const review = element.querySelector('tr[data-open] .catalog-review');
    expect(review?.querySelector('h3')?.textContent.trim()).toBe(
      'Needs review: the source changed since this was translated',
    );
    expect(review?.querySelector('del')?.textContent).toBe('Removed:Lanterns');
    expect(review?.querySelector('ins')?.textContent).toBe('Added:Lantern');
    expect(button(element, 'Keep as up to date')).toBeDefined();
    row(element, 'Dim').click();
    await settle();
    expect(
      element.querySelector('tr[data-open] .catalog-review .catalog-note')?.textContent,
    ).toContain('Its file marks this translation as needing review.');
  });

  it('shows a message’s context, and its key’s control characters as symbols', async () => {
    const { element } = await opened({ check: formsCheck, catalogs: { po: gettext } });
    const key = row(element, 'menu\u0004Open').querySelector('th');
    expect(key?.querySelector('bdi')?.textContent).toBe('menu␄Open');
    expect(key?.querySelector('.catalog-context')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Context: menu',
    );
  });
});
