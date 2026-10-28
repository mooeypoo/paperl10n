// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ApiMethod, PaperLionApi } from '#ipc-contract';
import { ok } from '#kernel/result';
import { guardApi } from './guard-api.ts';

function recorder() {
  const calls: [ApiMethod, unknown][] = [];
  return {
    calls,
    onUnexpected: (method: ApiMethod, thrown: unknown) => calls.push([method, thrown]),
  };
}

describe('guardApi', () => {
  it('passes results through untouched', async () => {
    const { calls, onUnexpected } = recorder();
    const api = guardApi(
      {
        openProject: () => Promise.resolve(ok(null)),
        listSourceDocuments: ({ projectId }) =>
          Promise.resolve(ok([{ key: projectId, sourcePath: 'a', targetPath: 'b' }])),
      },
      onUnexpected,
    );
    expect(await api.openProject()).toEqual({ ok: true, value: null });
    expect(await api.listSourceDocuments({ projectId: 'p' })).toEqual({
      ok: true,
      value: [{ key: 'p', sourcePath: 'a', targetPath: 'b' }],
    });
    expect(calls).toEqual([]);
  });

  it.each<[string, PaperLionApi]>([
    [
      'throws',
      {
        openProject: () => {
          throw new Error('sync boom');
        },
        listSourceDocuments: () => {
          throw new Error('sync boom');
        },
      },
    ],
    [
      'rejects',
      {
        openProject: () => Promise.reject(new Error('async boom')),
        listSourceDocuments: () => Promise.reject(new Error('async boom')),
      },
    ],
  ])('turns a method that %s into internal.unexpected, and reports it', async (_how, broken) => {
    const { calls, onUnexpected } = recorder();
    const api = guardApi(broken, onUnexpected);
    const unexpected = {
      ok: false,
      error: { code: 'internal.unexpected', params: {}, details: [] },
    };
    expect(await api.openProject()).toEqual(unexpected);
    expect(await api.listSourceDocuments({ projectId: 'p' })).toEqual(unexpected);
    expect(calls.map(([method]) => method)).toEqual(['openProject', 'listSourceDocuments']);
    expect(calls[0]?.[1]).toBeInstanceOf(Error);
  });
});
