// SPDX-License-Identifier: GPL-3.0-or-later
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import type {
  CatalogDetailDto,
  CatalogMessageDto,
  CatalogSaveDto,
  PaperLionApi,
} from '#ipc-contract';
import type { Result } from '#kernel/result';
import type { ErrorDto } from '#ipc-contract';
import { useCatalogSaving } from './use-catalog-saving';
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
const detail: CatalogDetailDto = {
  key: 'i18n',
  sourcePath: 'i18n/en.json',
  targetPath: 'i18n/he.json',
  targetExists: true,
  documentationPath: null,
  messages: [message],
  notInSource: [],
  documentationProblem: null,
  draft: null,
  statusFile: { exists: true, problem: null },
};
const savedAnswer: Result<CatalogSaveDto, ErrorDto> = {
  ok: true,
  value: { path: 'i18n/he.json', written: true, messages: [], statusProblem: null },
};

function start(
  saveCatalog: PaperLionApi['saveCatalog'],
  keep?: PaperLionApi['keepMessagesUpToDate'],
) {
  const client = {
    saveCatalog,
    keepMessagesUpToDate: keep ?? (() => Promise.reject(new Error('transport'))),
  } as unknown as PaperLionApi;
  const projectId = ref<string | null>('p-1');
  const catalog = ref<string | null>('i18n');
  let changed = 0;
  const scope = effectScope();
  const state = scope.run(() => {
    const edits = useMessageEdits(shallowRef(detail));
    const saving = useCatalogSaving(client, projectId, catalog, edits, {
      onChanged: () => {
        changed++;
      },
    });
    return { edits, saving };
  });
  if (state === undefined) throw new Error('test setup');
  return { ...state, projectId, catalog, changed: () => changed };
}

describe('useCatalogSaving', () => {
  it('saves nothing without edits, and says so', async () => {
    let asked = 0;
    const { saving, changed } = start(() => {
      asked++;
      return Promise.resolve(savedAnswer);
    });
    expect(await saving.save()).toBe(true);
    expect([asked, changed(), saving.status.value]).toEqual([0, 0, 'clean']);
  });

  it('saves once at a time, and not without a project', async () => {
    let finish: ((value: typeof savedAnswer) => void) | undefined;
    const { saving, edits, projectId } = start(() => new Promise((resolve) => (finish = resolve)));
    edits.edit(message, 'שלום');
    const first = saving.save();
    expect(await saving.save()).toBe(false);
    finish?.(savedAnswer);
    expect(await first).toBe(true);
    edits.edit(message, 'היי');
    projectId.value = null;
    expect(await saving.save()).toBe(false);
  });

  it('says something is left when a message was typed into during the save', async () => {
    let finish: ((value: typeof savedAnswer) => void) | undefined;
    const { saving, edits } = start(() => new Promise((resolve) => (finish = resolve)));
    edits.edit(message, 'שלום');
    const pending = saving.save();
    edits.edit(message, 'שלום!');
    finish?.(savedAnswer);
    expect(await pending).toBe(false);
    expect(saving.status.value).toBe('unsaved');
  });

  it('forgets the last error once a save works', async () => {
    let fail = true;
    const { saving, edits } = start(() =>
      Promise.resolve(
        fail
          ? { ok: false, error: { code: 'workspace.catalog-unwritable', params: {}, details: [] } }
          : savedAnswer,
      ),
    );
    edits.edit(message, 'שלום');
    expect(await saving.save()).toBe(false);
    expect(saving.error.value?.code).toBe('workspace.catalog-unwritable');
    fail = false;
    expect(await saving.save()).toBe(true);
    expect(saving.error.value).toBeNull();
  });

  it('keeps the edits when the catalog changed during the save', async () => {
    let finish: ((value: typeof savedAnswer) => void) | undefined;
    const { saving, edits, catalog, changed } = start(
      () => new Promise((resolve) => (finish = resolve)),
    );
    edits.edit(message, 'שלום');
    const pending = saving.save();
    catalog.value = 'api';
    await nextTick();
    finish?.(savedAnswer);
    expect(await pending).toBe(false);
    expect([edits.count.value, changed(), saving.status.value]).toEqual([1, 0, 'unsaved']);
  });

  it('reports a broken transport, and forgets errors when another catalog opens', async () => {
    const { saving, edits, catalog } = start(() => Promise.reject(new Error('transport')));
    edits.edit(message, 'שלום');
    expect(await saving.save()).toBe(false);
    expect(saving.error.value?.code).toBe('internal.unexpected');
    await saving.keep(message);
    expect(saving.error.value?.code).toBe('internal.unexpected');
    catalog.value = 'api';
    await flushPromises();
    expect(saving.error.value).toBeNull();
  });

  it('keeps a message, then reads again; not without a catalog', async () => {
    const requests: unknown[] = [];
    const { saving, changed, catalog } = start(
      () => Promise.resolve(savedAnswer),
      (request) => {
        requests.push(request);
        return Promise.resolve({ ok: true, value: [{ key: 'greeting', status: 'translated' }] });
      },
    );
    await saving.keep(message);
    expect(requests).toEqual([
      { projectId: 'p-1', catalog: 'i18n', messages: [{ key: 'greeting', source: 'Hello' }] },
    ]);
    expect(changed()).toBe(1);
    catalog.value = null;
    await saving.keep(message);
    expect([requests.length, changed()]).toEqual([1, 1]);
  });
});
