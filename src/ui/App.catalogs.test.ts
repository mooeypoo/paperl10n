// SPDX-License-Identifier: GPL-3.0-or-later
// Message catalogs in the sidebar (M4 C4b): the "Messages" group, each catalog's progress, and the
// project's progress line, through the real entry point with a fake client.
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogDto, CatalogListDto, ErrorDto } from '#ipc-contract';
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
) {
  const { client, calls } = fakeClient({
    open: [{ ok: true, value: { ...summary, ...formats, targetLocale } }],
    list: [{ ok: true, value: formats.documentFormat === null ? [] : pages }],
    catalogs,
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
