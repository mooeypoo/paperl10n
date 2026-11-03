// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import type { CatalogDetailDto, CatalogMessageDto, PaperLionApi } from '#ipc-contract';
import { useCatalogDrafts } from './use-catalog-drafts';
import { useMessageEdits } from './use-message-edits';

const message: CatalogMessageDto = {
  key: 'greeting',
  source: 'Hello',
  documentation: null,
  translation: null,
  status: 'missing',
  sourceTokens: [],
  translationTokens: [],
};
const read = (draft: CatalogDetailDto['draft'] = null, key = 'i18n'): CatalogDetailDto => ({
  key,
  sourcePath: `${key}/en.json`,
  targetPath: `${key}/he.json`,
  targetExists: true,
  documentationPath: null,
  messages: [message],
  notInSource: [{ key: 'gone', text: 'ישן', tokens: [] }],
  documentationProblem: null,
  draft,
  statusFile: { exists: true, problem: null },
});
const edit = { key: 'greeting', text: 'שלום', base: null, source: 'Hello' };

function start(client: Partial<PaperLionApi>) {
  const projectId = ref<string | null>('p-1');
  const catalog = ref<string | null>('i18n');
  const detail = shallowRef<CatalogDetailDto | null>(null);
  const draftChanges: [string, boolean][] = [];
  const scope = effectScope();
  const state = scope.run(() => {
    const edits = useMessageEdits(detail);
    const drafts = useCatalogDrafts(client as PaperLionApi, projectId, catalog, detail, edits, {
      onDraftChange: (key, has) => draftChanges.push([key, has]),
    });
    return { edits, drafts };
  });
  if (state === undefined) throw new Error('test setup');
  return { ...state, projectId, catalog, detail, draftChanges, scope };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useCatalogDrafts', () => {
  it('restores a draft on the catalog’s first read only, and not over edits', async () => {
    const { edits, drafts, detail, catalog } = start({});
    detail.value = read({ messages: [edit] });
    await nextTick();
    expect([edits.pending(), drafts.restoredNotice.value]).toEqual([[edit], true]);
    expect(drafts.restoredFromOlder.value).toBe(false);
    // Read again (after a save): not restored again.
    edits.discard();
    detail.value = read({ messages: [edit] });
    await nextTick();
    expect(edits.count.value).toBe(0);
    // Another catalog's read, while the catalog isn't that one yet: ignored.
    detail.value = read({ messages: [edit] }, 'api');
    await nextTick();
    expect(edits.count.value).toBe(0);
    catalog.value = 'api';
    await nextTick();
    expect(drafts.restoredNotice.value).toBe(false);
    detail.value = read(
      { messages: [{ ...edit, key: 'gone', text: '', base: 'אחר', source: null }] },
      'api',
    );
    await nextTick();
    expect(drafts.restoredFromOlder.value).toBe(true);
  });

  it('reads a removal still matching the file as unchanged since', async () => {
    const { drafts, detail } = start({});
    detail.value = read({
      messages: [{ key: 'gone', text: '', base: 'ישן', source: null }, edit],
    });
    await nextTick();
    expect([drafts.restoredNotice.value, drafts.restoredFromOlder.value]).toEqual([true, false]);
  });

  it('keeps nothing once the catalog changed or without one, and reports failures', async () => {
    const asked: unknown[] = [];
    const answers = [
      () => Promise.reject(new Error('transport')),
      () => Promise.resolve({ ok: true as const, value: null }),
    ];
    const { edits, drafts, catalog, projectId, draftChanges, scope } = start({
      saveCatalogDraft: (request) => {
        asked.push(request);
        return (answers.shift() ?? answers[0] ?? (() => Promise.reject(new Error('x'))))();
      },
    });
    edits.edit(message, 'שלום');
    await nextTick();
    catalog.value = 'api';
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toEqual([]);
    edits.edit(message, 'היי');
    await vi.advanceTimersByTimeAsync(800);
    expect(drafts.error.value?.code).toBe('internal.unexpected');
    edits.edit(message, 'היי!');
    await vi.advanceTimersByTimeAsync(800);
    expect(drafts.error.value).toBeNull();
    expect(draftChanges).toEqual([['api', true]]);
    projectId.value = null;
    edits.edit(message, 'x');
    await vi.advanceTimersByTimeAsync(800);
    expect(asked).toHaveLength(2);
    projectId.value = 'p-1';
    edits.edit(message, 'y');
    await nextTick();
    scope.stop();
    await vi.advanceTimersByTimeAsync(800);
    expect(asked).toHaveLength(2);
  });

  it('marks the draft gone only when it was forgotten', async () => {
    let fail = true;
    const { drafts, draftChanges, catalog } = start({
      discardCatalogDraft: () =>
        fail
          ? Promise.reject(new Error('transport'))
          : Promise.resolve({
              ok: false,
              error: { code: 'workspace.draft-unwritable', params: {}, details: [] },
            }),
    });
    await drafts.discard();
    fail = false;
    await drafts.discard();
    catalog.value = null;
    await drafts.discard();
    expect(draftChanges).toEqual([]);
  });
});
