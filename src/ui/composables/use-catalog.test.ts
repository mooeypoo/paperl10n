// SPDX-License-Identifier: GPL-3.0-or-later
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import type { CatalogDetailDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import { useCatalog } from './use-catalog';

type Answer = Result<CatalogDetailDto, ErrorDto>;

const detail = (key: string): CatalogDetailDto => ({
  key,
  sourcePath: `${key}/en.json`,
  targetPath: `${key}/he.json`,
  targetExists: true,
  documentationPath: null,
  messages: [],
  notInSource: [],
  documentationProblem: null,
  statusFile: { exists: false, problem: null },
});

/** A client whose catalog reads wait until the test answers them, in any order. */
function pending() {
  const answers: { key: string; answer: (value: Answer) => void }[] = [];
  const reject: { fail?: () => void } = {};
  const client = {
    readCatalog: ({ key }: { key: string }) =>
      new Promise<Answer>((resolve, fail) => {
        answers.push({ key, answer: resolve });
        reject.fail = () => {
          fail(new Error('transport'));
        };
      }),
  } as unknown as PaperLionApi;
  return { client, answers, reject };
}

function start(client: PaperLionApi, key: string | null = 'i18n') {
  const projectId = ref<string | null>('p-1');
  const catalog = ref<string | null>(key);
  const scope = effectScope();
  const state = scope.run(() => useCatalog(client, projectId, catalog));
  if (state === undefined) throw new Error('test setup');
  return { state, projectId, catalog };
}

describe('useCatalog', () => {
  it('reads the catalog, and is loading until it answers', async () => {
    const { client, answers } = pending();
    const { state } = start(client);
    expect(state.loading.value).toBe(true);
    answers[0]?.answer({ ok: true, value: detail('i18n') });
    await flushPromises();
    expect([state.detail.value?.key, state.error.value, state.loading.value]).toEqual([
      'i18n',
      null,
      false,
    ]);
  });

  it('keeps only the newest catalog when an older read answers late', async () => {
    const { client, answers } = pending();
    const { state, catalog } = start(client);
    catalog.value = 'api';
    await flushPromises();
    answers[1]?.answer({ ok: true, value: detail('api') });
    answers[0]?.answer({ ok: true, value: detail('i18n') });
    await flushPromises();
    expect(state.detail.value?.key).toBe('api');
    expect(state.loading.value).toBe(false);
  });

  it('shows the error of a read that fails, and of a broken transport', async () => {
    const { client, answers, reject } = pending();
    const { state, catalog } = start(client);
    const unknown = {
      code: 'workspace.unknown-catalog' as const,
      params: { key: 'i18n' },
      details: [],
    };
    answers[0]?.answer({ ok: false, error: unknown });
    await flushPromises();
    expect([state.detail.value, state.error.value]).toEqual([null, unknown]);
    catalog.value = 'api';
    await flushPromises();
    reject.fail?.();
    await flushPromises();
    expect(state.error.value?.code).toBe('internal.unexpected');
  });

  it('reads nothing without a catalog', async () => {
    const { client, answers } = pending();
    const { state, catalog } = start(client);
    catalog.value = null;
    await flushPromises();
    answers[0]?.answer({ ok: true, value: detail('i18n') });
    await flushPromises();
    expect([state.detail.value, state.loading.value]).toEqual([null, false]);
    // Only the first catalog was ever asked for.
    expect(answers.map((a) => a.key)).toEqual(['i18n']);
  });
});
