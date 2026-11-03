// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import type { CatalogDetailDto, CatalogMessageDto } from '#ipc-contract';
import { useMessageEdits } from './use-message-edits';

const translated: CatalogMessageDto = {
  key: 'greeting',
  source: 'Hello $1',
  documentation: null,
  translation: 'שלום $1',
  status: 'translated',
  sourceTokens: [{ kind: 'parameter', start: 6, end: 8 }],
  translationTokens: [{ kind: 'parameter', start: 5, end: 7 }],
  context: null,
  sourceForms: null,
  translationForms: null,
  needsReview: false,
  previousSource: null,
};
const missing: CatalogMessageDto = {
  ...translated,
  key: 'farewell',
  translation: null,
  status: 'missing',
  translationTokens: [],
  context: null,
  sourceForms: null,
  translationForms: null,
  needsReview: false,
  previousSource: null,
};
const catalog = (key: string): CatalogDetailDto => ({
  key,
  sourcePath: `${key}/en.json`,
  targetPath: `${key}/he.json`,
  targetExists: true,
  documentationPath: null,
  messages: [translated, missing],
  notInSource: [],
  documentationProblem: null,
  pluralForms: [],
  draft: null,
  statusFile: { exists: true, problem: null },
});
const token = (start: number, end: number) => ({ kind: 'parameter' as const, start, end });

describe('useMessageEdits', () => {
  it('shows the file’s translation, with its tokens, until it’s edited', () => {
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    expect(edits.shown(translated)).toEqual({ text: 'שלום $1', tokens: [token(5, 7)] });
    expect(edits.shown(missing)).toBeNull();
    expect([edits.textOf(translated), edits.textOf(missing)]).toEqual(['שלום $1', '']);
    expect(edits.count.value).toBe(0);
  });

  it('keeps an edit, with the tokens main found in that very text', () => {
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    edits.edit(missing, 'להתראות $1');
    expect(edits.isEdited('farewell')).toBe(true);
    expect(edits.textOf(missing)).toBe('להתראות $1');
    // Not known yet; then known; then the text changed again before main answered.
    expect(edits.shown(missing)).toEqual({ text: 'להתראות $1', tokens: [] });
    edits.remember('farewell', 'להתראות $1', [token(8, 10)]);
    expect(edits.shown(missing)).toEqual({ text: 'להתראות $1', tokens: [token(8, 10)] });
    edits.edit(missing, 'ביי $1');
    expect(edits.shown(missing)).toEqual({ text: 'ביי $1', tokens: [] });
    expect(edits.count.value).toBe(1);
  });

  it('counts the file’s own text as no edit, and an emptied translation as none shown', () => {
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    edits.edit(translated, 'שלום');
    edits.edit(translated, 'שלום $1');
    expect(edits.isEdited('greeting')).toBe(false);
    edits.edit(translated, '');
    expect(edits.isEdited('greeting')).toBe(true);
    expect(edits.shown(translated)).toBeNull();
    edits.edit(missing, '');
    expect(edits.isEdited('farewell')).toBe(false);
  });

  it('starts another catalog with no edits and nothing open', async () => {
    const detail = shallowRef<CatalogDetailDto | null>(catalog('i18n'));
    const edits = useMessageEdits(detail);
    edits.open.value = 'farewell';
    edits.edit(missing, 'ביי');
    edits.remember('greeting', 'שלום $1', []);
    detail.value = catalog('api');
    await nextTick();
    expect([edits.open.value, edits.count.value]).toEqual([null, 0]);
    expect(edits.shown(translated)).toEqual({ text: 'שלום $1', tokens: [token(5, 7)] });
  });

  it('lists the edits as saving takes them, each from the translation and source it started with', () => {
    const detail = shallowRef<CatalogDetailDto | null>(catalog('i18n'));
    const edits = useMessageEdits(detail);
    edits.edit(missing, 'ביי');
    edits.edit(translated, 'היי $1');
    // The catalog read again (after another message's save): the edit keeps where it started.
    edits.edit({ ...translated, translation: 'שלום רב $1', source: 'Hi $1' }, 'היי $1!');
    expect(edits.pending()).toEqual([
      { key: 'farewell', text: 'ביי', base: null, source: 'Hello $1' },
      { key: 'greeting', text: 'היי $1!', base: 'שלום $1', source: 'Hello $1' },
    ]);
  });

  it('forgets saved edits; one typed into since starts from the saved text', () => {
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    edits.edit(missing, 'ביי');
    edits.edit(translated, 'היי');
    const saving = edits.pending();
    edits.edit(translated, 'היי!');
    edits.saved([...saving, { key: 'other', text: 'x', base: null, source: null }]);
    expect(edits.pending()).toEqual([
      { key: 'greeting', text: 'היי!', base: 'היי', source: 'Hello $1' },
    ]);
    // Emptied, saved (so removed), then written again: it starts from no translation.
    edits.edit(translated, '');
    const removing = edits.pending();
    edits.edit(translated, 'חדש');
    edits.saved(removing);
    expect(edits.pending()[0]?.base).toBeNull();
  });

  it('keeps a plural’s forms as written, with the forms it started from, until they match the file again', () => {
    const plural: CatalogMessageDto = {
      ...translated,
      key: 'files',
      translation: 'קובץ',
      translationForms: [
        { text: 'קובץ', tokens: [] },
        { text: '$1 קבצים', tokens: [token(0, 2)] },
      ],
    };
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    // Padded to the language's forms; the file's when not edited.
    expect(edits.formsOf(plural, 3)).toEqual(['קובץ', '$1 קבצים', '']);
    expect(edits.formsOf(missing, 2)).toEqual(['', '']);
    edits.editForms(plural, ['קובץ', '$1 קבצים', 'עוד']);
    edits.editForms(plural, ['קבץ', '$1 קבצים', 'עוד']);
    expect(edits.pending()).toEqual([
      {
        key: 'files',
        text: 'קבץ',
        forms: ['קבץ', '$1 קבצים', 'עוד'],
        base: 'קובץ',
        baseForms: ['קובץ', '$1 קבצים'],
        source: 'Hello $1',
      },
    ]);
    expect(edits.formsOf(plural, 3)).toEqual(['קבץ', '$1 קבצים', 'עוד']);
    edits.editForms(plural, ['קובץ', '$1 קבצים']);
    expect(edits.isEdited('files')).toBe(false);
    // An untranslated plural left empty is no edit.
    edits.editForms(missing, ['', '']);
    expect(edits.isEdited('farewell')).toBe(false);
    edits.editForms(missing, ['', 'x']);
    expect(edits.pending()[0]).toMatchObject({ text: '', forms: ['', 'x'], baseForms: null });
  });

  it('forgets a saved plural only when its forms were saved; one typed into since starts from them', () => {
    const plural: CatalogMessageDto = { ...missing, key: 'files', sourceForms: [] };
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    edits.editForms(plural, ['א', 'ב']);
    const [sent] = edits.pending();
    if (sent === undefined) throw new Error('test setup');
    edits.editForms(plural, ['א', 'בב']);
    edits.saved([sent]);
    expect(edits.pending()).toEqual([
      {
        key: 'files',
        text: 'א',
        forms: ['א', 'בב'],
        base: 'א',
        baseForms: ['א', 'ב'],
        source: 'Hello $1',
      },
    ]);
    // Edited again: still from what was saved, not from the file as first read.
    edits.editForms(plural, ['א', 'בבב']);
    expect(edits.pending()[0]?.baseForms).toEqual(['א', 'ב']);
    edits.saved(edits.pending());
    expect(edits.count.value).toBe(0);
  });

  it('drops every edit when they’re discarded', () => {
    const edits = useMessageEdits(shallowRef(catalog('i18n')));
    edits.edit(missing, 'ביי');
    edits.discard();
    expect([edits.count.value, edits.pending()]).toEqual([0, []]);
  });

  it('removes a message the source no longer has, keeps it again, and counts only these changes', async () => {
    const detail = shallowRef<CatalogDetailDto | null>(catalog('i18n'));
    const edits = useMessageEdits(detail);
    edits.remove('gone', 'ישן');
    expect(edits.pending()).toEqual([{ key: 'gone', text: '', base: 'ישן', source: null }]);
    edits.unremove('gone');
    edits.edit(missing, 'ביי');
    expect([edits.count.value, edits.changes.value]).toEqual([1, 3]);
    // Not the translator's changes: restoring, saving, discarding, another catalog.
    edits.restore([{ key: 'greeting', text: 'היי', base: 'שלום $1', source: 'Hello $1' }]);
    expect(edits.pending().map((edit) => edit.key)).toEqual(['greeting']);
    edits.saved(edits.pending());
    edits.discard();
    detail.value = catalog('api');
    await nextTick();
    expect(edits.changes.value).toBe(3);
  });
});
