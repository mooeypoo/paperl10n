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
});
const list = [doc('index'), doc('guide/getting-started'), doc('guide/configuration'), doc('about')];

describe('usePages', () => {
  it('selects the first document', () => {
    const pages = usePages(shallowRef(list));
    expect(pages.selected.value?.key).toBe('index');
  });

  it('selects nothing in an empty project', () => {
    const pages = usePages(shallowRef([]));
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
    const pages = usePages(shallowRef(list));
    pages.query.value = query;
    expect(pages.matches.value.map((document) => document.key)).toEqual(expected);
  });

  it('keeps the selection while searching, even if it no longer matches', () => {
    const pages = usePages(shallowRef(list));
    pages.selectedKey.value = 'about';
    pages.query.value = 'guide';
    expect(pages.selected.value?.key).toBe('about');
  });

  it('clears the search and selects the first document when another project opens', async () => {
    const documents = shallowRef(list);
    const pages = usePages(documents);
    pages.query.value = 'guide';
    pages.selectedKey.value = 'about';
    documents.value = [doc('home'), doc('faq')];
    await nextTick();
    expect(pages.query.value).toBe('');
    expect(pages.selected.value?.key).toBe('home');
  });
});
