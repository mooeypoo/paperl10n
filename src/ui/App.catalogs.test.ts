// SPDX-License-Identifier: GPL-3.0-or-later
// Message catalogs in the sidebar (M4 C4b): the "Messages" group, each catalog's progress, and the
// project's progress line, through the real entry point with a fake client.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CatalogDetailDto,
  CatalogDto,
  CatalogListDto,
  CatalogMessageDto,
  ErrorDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import { mountApp } from './mount';
import { memoryPreferences } from './preferences';
import { documents, error, fakeClient, summary } from './test-support';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
});

const banana = { id: 'catalog-banana', displayName: 'banana-i18n' };

function catalog(key: string, translated: number, total: number, outdated = 0): CatalogDto {
  return {
    key,
    sourcePath: `${key}/en.json`,
    targetPath: `${key}/he.json`,
    targetExists: true,
    progress: {
      total,
      byStatus: { missing: total - translated - outdated, draft: 0, translated, outdated },
      notInSource: 0,
    },
    problem: null,
  };
}

const listed = (catalogs: CatalogDto[]): Result<CatalogListDto, ErrorDto> => ({
  ok: true,
  value: { catalogs, statusFile: { exists: true, problem: null } },
});

async function opened(
  formats: { documentFormat: typeof summary.documentFormat; catalogFormat: typeof banana | null },
  catalogs: Result<CatalogListDto, ErrorDto> = listed([]),
  pages = documents,
  targetLocale: typeof summary.targetLocale = summary.targetLocale,
  readCatalog: Readonly<Record<string, Result<CatalogDetailDto, ErrorDto>>> = {},
) {
  const { client, calls } = fakeClient({
    open: [{ ok: true, value: { ...summary, ...formats, targetLocale } }],
    list: [{ ok: true, value: formats.documentFormat === null ? [] : pages }],
    catalogs,
    readCatalog,
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
  const open = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent.trim() === 'Open folder…',
  );
  open?.click();
  await flushPromises();
  return { element, calls };
}

const nav = (element: Element) => element.querySelector('nav');
const headings = (element: Element) =>
  [...(nav(element)?.querySelectorAll('h2') ?? [])].map((h) => h.textContent.trim());
/** Each catalog row's parts (its key, then its progress or problem), joined with " | ". */
const rows = (element: Element) =>
  [...(nav(element)?.querySelectorAll('.catalogs-item') ?? [])].map((row) =>
    [...row.children].map((part) => part.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
  );
const progress = (element: Element) =>
  nav(element)?.querySelector(':scope > .pages-progress')?.textContent.trim();

describe('catalogs in the sidebar', () => {
  it('lists the catalogs of a project without pages, with their progress', async () => {
    const { element, calls } = await opened(
      { documentFormat: null, catalogFormat: banana },
      listed([catalog('i18n', 3, 5, 1), catalog('i18n/api', 0, 2)]),
    );
    expect(calls).toContain('listCatalogs:p-1');
    expect(nav(element)?.getAttribute('aria-label')).toBe('What to translate');
    expect(headings(element)).toEqual(['Messages']);
    expect(nav(element)?.textContent).toContain('2 catalogs');
    expect(rows(element)).toEqual([
      'i18n | 3 of 5 up to date · 1 outdated',
      'i18n/api | 0 of 2 up to date',
    ]);
    expect(progress(element)).toBe('Up to date: 3 of 7 messages');
    // No pages: no page search, and no "no source documents" note.
    expect(nav(element)?.querySelector('input[type="search"]')).toBeNull();
    expect(element.textContent).not.toContain('No source documents found.');
  });

  it('shows pages and messages together, with one progress line for both', async () => {
    const { element } = await opened(
      { documentFormat: summary.documentFormat, catalogFormat: banana },
      listed([catalog('i18n', 4, 5)]),
    );
    expect(headings(element)).toEqual(['Pages', 'Messages']);
    expect(progress(element)).toBe('Up to date: 0 of 2 pages, 4 of 5 messages');
  });

  it('isolates a catalog key, and shows a catalog it could not read with why', async () => {
    const unreadable: CatalogDto = {
      ...catalog('i18n', 0, 0),
      progress: null,
      problem: error('workspace.catalog-unreadable', {
        file: 'i18n/he.json',
        problem: 'files.not-utf8',
      }),
    };
    const { element } = await opened(
      { documentFormat: null, catalogFormat: banana },
      listed([unreadable, catalog('api', 1, 1)]),
    );
    expect(rows(element)).toEqual([
      "i18n | The catalog file i18n/he.json can't be read (files.not-utf8).",
      'api | 1 of 1 up to date',
    ]);
    expect(nav(element)?.querySelector('.catalogs-item bdi')?.textContent).toBe('i18n');
    expect(progress(element)).toBe('Up to date: 1 of 1 message');
  });

  it('says when a catalog format found no catalogs', async () => {
    const { element } = await opened({ documentFormat: null, catalogFormat: banana });
    expect(nav(element)?.textContent).toContain('No message catalogs found.');
    expect(progress(element)).toBeUndefined();
  });

  it('never asks for catalogs, nor shows the group, for a project with pages only', async () => {
    const { element, calls } = await opened({
      documentFormat: summary.documentFormat,
      catalogFormat: null,
    });
    expect(calls.some((call) => call.startsWith('listCatalogs'))).toBe(false);
    expect(headings(element)).toEqual(['Pages']);
    expect(progress(element)).toBe('Up to date: 0 of 2');
  });

  it('lists the catalogs only once a target language is chosen', async () => {
    const { element, calls } = await opened(
      { documentFormat: null, catalogFormat: banana },
      listed([catalog('i18n', 1, 2)]),
      documents,
      null,
    );
    expect(calls.some((call) => call.startsWith('listCatalogs'))).toBe(false);
    expect(nav(element)?.textContent).toContain('No message catalogs found.');
    const french = [...document.querySelectorAll('dialog.picker [role="option"]')][1];
    (french as HTMLElement | undefined)?.click();
    await flushPromises();
    expect(calls.slice(calls.indexOf('chooseTargetLocale:p-1:fr'))).toEqual([
      'chooseTargetLocale:p-1:fr',
      'listSourceDocuments:p-1',
      'listCatalogs:p-1',
    ]);
    expect(rows(element)).toEqual(['i18n | 1 of 2 up to date']);
  });

  it('shows the error when the catalogs can’t be listed', async () => {
    const { element } = await opened(
      { documentFormat: null, catalogFormat: banana },
      {
        ok: false,
        error: error('formats.plugin-failed', { formatId: 'catalog-banana', reason: 'boom' }),
      },
    );
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The catalog-banana plugin failed unexpectedly: boom',
    );
  });
});

const message = (
  key: string,
  source: string,
  translation: string | null,
  status: CatalogMessageDto['status'],
  tokens: {
    source?: CatalogMessageDto['sourceTokens'];
    translation?: CatalogMessageDto['translationTokens'];
  } = {},
): CatalogMessageDto => ({
  key,
  source,
  documentation: null,
  translation,
  status,
  sourceTokens: tokens.source ?? [],
  translationTokens: tokens.translation ?? [],
});

function detail(key: string, overrides: Partial<CatalogDetailDto> = {}): CatalogDetailDto {
  return {
    key,
    sourcePath: `${key}/en.json`,
    targetPath: `${key}/he.json`,
    targetExists: true,
    documentationPath: `${key}/qqq.json`,
    messages: [
      message('app-items', 'You have $1 items', 'יש לך $1 פריטים', 'translated', {
        source: [{ kind: 'parameter', start: 9, end: 11 }],
        translation: [{ kind: 'parameter', start: 6, end: 8 }],
      }),
      message('app-save', 'Save', null, 'missing'),
      message('app-close', 'Close', 'סגירה', 'outdated'),
    ],
    notInSource: [],
    documentationProblem: null,
    statusFile: { exists: true, problem: null },
    ...overrides,
  };
}

const read = (value: CatalogDetailDto) => ({ ok: true as const, value });
const catalogRows = (element: Element) =>
  [...element.querySelectorAll('.catalog-messages tbody tr')].map((row) =>
    [...row.children].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
  );
const sidebarButton = (element: Element, key: string) => {
  const found = [...element.querySelectorAll('nav li button')].find(
    (candidate) => candidate.querySelector('bdi')?.textContent === key,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no sidebar item "${key}"`);
  return found;
};
async function setInput(element: Element, selector: string, value: string, event = 'input') {
  const input = element.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (input === null) throw new Error(`no ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event(event));
  await flushPromises();
}

describe('the message list', () => {
  const catalogsOnly = { documentFormat: null, catalogFormat: banana };

  it('opens a project without pages on its first catalog, with a row per message', async () => {
    const { element, calls } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 1, 3), catalog('api', 0, 1)]),
      documents,
      summary.targetLocale,
      { i18n: read(detail('i18n')) },
    );
    expect(calls).toContain('readCatalog:p-1:i18n');
    expect(element.querySelector('.catalog-title')?.textContent).toBe('i18n');
    expect(element.querySelector('.catalog-paths')?.textContent).toContain('i18n/en.json');
    expect(sidebarButton(element, 'i18n').getAttribute('aria-current')).toBe('page');
    expect(catalogRows(element)).toEqual([
      ['app-items', 'You have $1 items', 'יש לך $1 פריטים', 'Up to date'],
      ['app-save', 'Save', '', 'Not translated yet'],
      ['app-close', 'Close', 'סגירה', 'Outdated: the source changed since'],
    ]);
    expect(element.querySelector('.catalog-count')?.textContent.trim()).toBe('Showing 3 of 3');
  });

  it('gives each text column its language and direction, and isolates tokens', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 1, 3)]),
      documents,
      summary.targetLocale,
      {
        i18n: read(detail('i18n')),
      },
    );
    const [, source, translation] = [
      ...(element.querySelector('.catalog-messages tbody tr')?.children ?? []),
    ];
    expect([source?.getAttribute('lang'), source?.getAttribute('dir')]).toEqual(['en', 'ltr']);
    expect([translation?.getAttribute('lang'), translation?.getAttribute('dir')]).toEqual([
      'he',
      'rtl',
    ]);
    const token = translation?.querySelector('bdi.message-token');
    expect([
      token?.textContent,
      token?.getAttribute('dir'),
      token?.getAttribute('data-token'),
    ]).toEqual(['$1', 'ltr', 'parameter']);
  });

  it('searches and filters the messages, and says when nothing matches', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 1, 3)]),
      documents,
      summary.targetLocale,
      {
        i18n: read(detail('i18n')),
      },
    );
    await setInput(element, '.catalog-filter select', 'needs-work', 'change');
    expect(catalogRows(element).map(([key]) => key)).toEqual(['app-save', 'app-close']);
    expect(element.querySelector('.catalog-count')?.textContent.trim()).toBe('Showing 2 of 3');
    await setInput(element, '.catalog-search input', 'סגירה');
    expect(catalogRows(element).map(([key]) => key)).toEqual(['app-close']);
    await setInput(element, '.catalog-search input', 'zebra');
    expect(element.querySelector('.catalog-messages')).toBeNull();
    expect(element.querySelector('.catalog-none')?.textContent).toBe('No message matches.');
  });

  it('starts another catalog with every message showing', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 1, 3), catalog('api', 1, 3)]),
      documents,
      summary.targetLocale,
      { i18n: read(detail('i18n')), api: read(detail('api')) },
    );
    await setInput(element, '.catalog-search input', 'zebra');
    sidebarButton(element, 'api').click();
    await flushPromises();
    expect(element.querySelector('.catalog-title')?.textContent).toBe('api');
    expect(element.querySelector<HTMLInputElement>('.catalog-search input')?.value).toBe('');
    expect(catalogRows(element)).toHaveLength(3);
  });

  it('lists the messages the source no longer has apart', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 1, 3)]),
      documents,
      summary.targetLocale,
      {
        i18n: read(detail('i18n', { notInSource: [{ key: 'app-old', text: 'ישן', tokens: [] }] })),
      },
    );
    const orphans = element.querySelector('.catalog-orphans');
    expect(orphans?.querySelector('h3')?.textContent).toBe(
      'One message is no longer in the source',
    );
    expect(
      [...(orphans?.querySelector('li')?.children ?? [])].map((part) => part.textContent.trim()),
    ).toEqual(['app-old', 'ישן']);
    expect(orphans?.querySelector('li [lang]')?.getAttribute('dir')).toBe('rtl');
  });

  it('notes a missing translation file and documentation it could not read', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 0, 3)]),
      documents,
      summary.targetLocale,
      {
        i18n: read(
          detail('i18n', {
            targetExists: false,
            documentationProblem: error('formats.invalid-catalog', {
              formatId: 'catalog-banana',
              reason: 'bad JSON',
            }),
          }),
        ),
      },
    );
    expect(element.querySelector('.catalog-paths')?.textContent).toContain(
      'no translation file yet',
    );
    expect(element.querySelector('.catalog-warning')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      "The messages' documentation can't be shown: catalog-banana can't read this catalog file: bad JSON",
    );
    expect(catalogRows(element)).toHaveLength(3);
  });

  it('shows why a catalog could not be read', async () => {
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 0, 3)]),
      documents,
      summary.targetLocale,
      {
        i18n: { ok: false, error: error('workspace.unknown-catalog', { key: 'i18n' }) },
      },
    );
    expect(element.querySelector('.catalog-error')?.textContent).toContain(
      'The catalog "i18n" isn\'t in this project anymore.',
    );
  });

  it('renders only the rows in view of a long catalog, following the scroll', async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      message(`msg-${String(i)}`, `M${String(i)}`, null, 'missing'),
    );
    const { element } = await opened(
      catalogsOnly,
      listed([catalog('i18n', 0, 1000)]),
      documents,
      summary.targetLocale,
      {
        i18n: read(detail('i18n', { messages: many })),
      },
    );
    const table = element.querySelector('.catalog-messages');
    const rendered = () =>
      [...element.querySelectorAll('.catalog-messages tr[data-row]')].map((row) =>
        row.getAttribute('aria-rowindex'),
      );
    const spacers = () =>
      [...element.querySelectorAll<HTMLElement>('.catalog-spacer td')].map(
        (cell) => cell.style.blockSize,
      );
    expect(table?.getAttribute('aria-rowcount')).toBe('1001');
    // Before layout, rows are 72 px and the view 800 px: 12 rows in view and 8 more below.
    expect(rendered()).toHaveLength(20);
    expect(rendered()[0]).toBe('2');
    expect(spacers()).toEqual([`${String(980 * 72)}px`]);

    const box = element.querySelector<HTMLElement>('.catalog-scroll');
    if (box === null) throw new Error('no scroll box');
    box.scrollTop = 72 * 500;
    box.dispatchEvent(new Event('scroll'));
    await flushPromises();
    expect(rendered()[0]).toBe(String(500 - 8 + 2));
    expect(rendered()).toHaveLength(28);
    expect(spacers()).toEqual([`${String(492 * 72)}px`, `${String((1000 - 520) * 72)}px`]);

    // A search starts again at the top.
    await setInput(element, '.catalog-search input', 'msg-99');
    expect(rendered()).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(box.scrollTop).toBe(0);
  });

  it('starts on the first page when there are pages, and goes between pages and catalogs', async () => {
    const { element, calls } = await opened(
      { documentFormat: summary.documentFormat, catalogFormat: banana },
      listed([catalog('i18n', 1, 3)]),
      documents,
      summary.targetLocale,
      { i18n: read(detail('i18n')) },
    );
    expect(element.querySelector('.catalog')).toBeNull();
    expect(calls).not.toContain('readCatalog:p-1:i18n');
    sidebarButton(element, 'i18n').click();
    await flushPromises();
    expect(element.querySelector('.catalog-title')?.textContent).toBe('i18n');
    expect(element.querySelectorAll('section[lang]')).toHaveLength(0);
    sidebarButton(element, 'index').click();
    await flushPromises();
    expect(element.querySelector('.catalog')).toBeNull();
    expect(sidebarButton(element, 'index').getAttribute('aria-current')).toBe('page');
    expect(sidebarButton(element, 'i18n').hasAttribute('aria-current')).toBe(false);
  });
});
