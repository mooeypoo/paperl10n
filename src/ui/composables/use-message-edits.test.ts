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
};
const missing: CatalogMessageDto = {
  ...translated,
  key: 'farewell',
  translation: null,
  status: 'missing',
  translationTokens: [],
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
});
