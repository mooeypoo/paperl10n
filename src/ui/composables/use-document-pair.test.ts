// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { error, fakeClient, pairFor } from '../test-support';
import { useDocumentPair } from './use-document-pair';

describe('useDocumentPair', () => {
  it('loads the selected page, and the next one when the selection changes', async () => {
    const { client, calls } = fakeClient();
    const key = ref<string | null>('index');
    const state = useDocumentPair(client, ref('p-1'), key);
    await flushPromises();
    expect(state.pair.value?.key).toBe('index');
    key.value = 'guide/intro';
    await flushPromises();
    expect(state.pair.value?.key).toBe('guide/intro');
    expect(calls).toEqual(['readDocumentPair:p-1:index', 'readDocumentPair:p-1:guide/intro']);
  });

  it('reads the same page again on reload, as a new pair', async () => {
    const read = { index: { ok: true as const, value: pairFor('index', 'Home\n', 'בית\n') } };
    const { client, calls } = fakeClient({ read });
    const state = useDocumentPair(client, ref('p-1'), ref('index'));
    await flushPromises();
    read.index = { ok: true, value: pairFor('index', 'Home\n', 'שלהם\n') };
    state.reload();
    expect(state.loading.value).toBe(true);
    await flushPromises();
    expect(state.pair.value?.target?.text).toBe('שלהם\n');
    expect(calls).toEqual(['readDocumentPair:p-1:index', 'readDocumentPair:p-1:index']);
  });

  it('loads nothing without a project or a page', async () => {
    const { client, calls } = fakeClient();
    const state = useDocumentPair(client, ref(null), ref('index'));
    await flushPromises();
    expect(state.pair.value).toBeNull();
    expect(calls).toEqual([]);
  });

  it('keeps the error and clears the pair when reading fails', async () => {
    const failure = error('workspace.document-unreadable', {
      file: 'he/a.md',
      problem: 'files.not-utf8',
    });
    const { client } = fakeClient({ read: { a: { ok: false, error: failure } } });
    const state = useDocumentPair(client, ref('p-1'), ref('a'));
    await flushPromises();
    expect(state.pair.value).toBeNull();
    expect(state.error.value).toEqual(failure);
  });

  it('reports a broken transport as internal.unexpected', async () => {
    const client: PaperLionApi = {
      ...fakeClient().client,
      readDocumentPair: () => Promise.reject(new Error('channel closed')),
    };
    const state = useDocumentPair(client, ref('p-1'), ref('a'));
    await flushPromises();
    expect(state.error.value?.code).toBe('internal.unexpected');
    expect(state.loading.value).toBe(false);
  });

  it('ignores a slow answer for a page that is no longer selected', async () => {
    const resolvers = new Map<string, (value: Result<DocumentPairDto, ErrorDto>) => void>();
    const client: PaperLionApi = {
      ...fakeClient().client,
      readDocumentPair: ({ key }) => new Promise((resolve) => resolvers.set(key, resolve)),
    };
    const key = ref<string | null>('slow');
    const state = useDocumentPair(client, ref('p-1'), key);
    await flushPromises();
    key.value = 'fast';
    await flushPromises();
    expect(state.loading.value).toBe(true);
    resolvers.get('fast')?.({ ok: true, value: pairFor('fast', 'F') });
    await flushPromises();
    resolvers.get('slow')?.({ ok: true, value: pairFor('slow', 'S') });
    await flushPromises();
    expect(state.pair.value?.key).toBe('fast');
    expect(state.loading.value).toBe(false);
  });
});
