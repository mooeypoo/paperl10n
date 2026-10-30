// SPDX-License-Identifier: GPL-3.0-or-later
import type { SourceDocumentDto } from '#ipc-contract';
import { describe, expect, it } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import { usePages } from './use-pages';

const doc = (key: string): SourceDocumentDto => ({
  key,
  sourcePath: `docs/en/${key}.md`,
  targetPath: `docs/he/${key}.md`,
  targetExists: true,
  hasDraft: false,
  status: 'draft',
});
const list = [doc('index'), doc('guide/getting-started'), doc('guide/configuration'), doc('about')];

describe('usePages', () => {
  it('selects the first document', () => {
    const pages = usePages(shallowRef(list), shallowRef('p-1'));
    expect(pages.selected.value?.key).toBe('index');
  });

  it('selects nothing in an empty project', () => {
    const pages = usePages(shallowRef([]), shallowRef('p-1'));
    expect(pages.selected.value).toBeNull();
  });

  it.each<[string, string, string[]]>([
    [
      'everything for an empty query',
      '',
      ['index', 'guide/getting-started', 'guide/configuration', 'about'],
    ],
    ['by part of a key', 'config', ['guide/configuration']],
    ['by a path segment', 'guide', ['guide/getting-started', 'guide/configuration']],
    ['ignoring case', 'GUIDE/GETTING', ['guide/getting-started']],
    ['by every word, in any order', 'started guide', ['guide/getting-started']],
    ['by the target path too', 'docs/he/about', ['about']],
    ['nothing when no document matches', 'zebra', []],
  ])('finds %s', (_description, query, expected) => {
    const pages = usePages(shallowRef(list), shallowRef('p-1'));
    pages.query.value = query;
    expect(pages.matches.value.map((document) => document.key)).toEqual(expected);
  });

  it('keeps the selection while searching, even if it no longer matches', () => {
    const pages = usePages(shallowRef(list), shallowRef('p-1'));
    pages.selectedKey.value = 'about';
    pages.query.value = 'guide';
    expect(pages.selected.value?.key).toBe('about');
  });

  it('clears the search and selects the first document when another project opens', async () => {
    const documents = shallowRef(list);
    const project = shallowRef('p-1');
    const pages = usePages(documents, project);
    pages.query.value = 'guide';
    pages.selectedKey.value = 'about';
    documents.value = [doc('home'), doc('about')];
    project.value = 'p-2';
    await nextTick();
    expect(pages.query.value).toBe('');
    expect(pages.selected.value?.key).toBe('home');
  });

  it("keeps the search and the selection when the same project's list changes", async () => {
    const documents = shallowRef(list);
    const pages = usePages(documents, shallowRef('p-1'));
    pages.query.value = 'guide';
    pages.selectedKey.value = 'about';
    documents.value = list.map((document) => ({ ...document, targetExists: false }));
    await nextTick();
    expect(pages.query.value).toBe('guide');
    expect(pages.selected.value?.key).toBe('about');
    // Unless the selected page is gone: then the first one.
    documents.value = [doc('home')];
    await nextTick();
    expect(pages.selected.value?.key).toBe('home');
  });
});
