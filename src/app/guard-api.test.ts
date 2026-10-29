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
          Promise.resolve(
            ok([
              {
                key: projectId,
                sourcePath: 'a',
                targetPath: 'b',
                targetExists: false,
                hasDraft: false,
              },
            ]),
          ),
        readDocumentPair: ({ key }) =>
          Promise.resolve(
            ok({
              key,
              source: { path: 'a', mdx: false, text: '', blocks: [], inline: [] },
              target: null,
              draft: null,
            }),
          ),
        suggestTargetLanguages: () =>
          Promise.resolve(ok({ inProject: [], recent: [], suggested: [] })),
        searchTargetLanguages: ({ query }) =>
          Promise.resolve(ok([{ tag: query, name: query, autonym: null, direction: 'ltr' }])),
        chooseTargetLocale: ({ language }) =>
          Promise.resolve(ok({ id: language, direction: 'rtl' })),
        saveDocument: ({ key }) => Promise.resolve(ok({ path: key, written: false })),
        saveDraft: () => Promise.resolve(ok(null)),
        discardDraft: () => Promise.resolve(ok(null)),
      },
      onUnexpected,
    );
    expect(await api.openProject()).toEqual({ ok: true, value: null });
    expect(await api.listSourceDocuments({ projectId: 'p' })).toEqual({
      ok: true,
      value: [{ key: 'p', sourcePath: 'a', targetPath: 'b', targetExists: false, hasDraft: false }],
    });
    expect(await api.readDocumentPair({ projectId: 'p', key: 'k' })).toEqual({
      ok: true,
      value: {
        key: 'k',
        source: { path: 'a', mdx: false, text: '', blocks: [], inline: [] },
        target: null,
        draft: null,
      },
    });
    expect(
      await api.suggestTargetLanguages({
        projectId: 'p',
        recent: [],
        systemLanguages: [],
        uiLanguage: 'en',
      }),
    ).toEqual({ ok: true, value: { inProject: [], recent: [], suggested: [] } });
    expect(
      await api.searchTargetLanguages({ projectId: 'p', query: 'x', uiLanguage: 'en' }),
    ).toEqual({ ok: true, value: [{ tag: 'x', name: 'x', autonym: null, direction: 'ltr' }] });
    expect(await api.chooseTargetLocale({ projectId: 'p', language: 'he' })).toEqual({
      ok: true,
      value: { id: 'he', direction: 'rtl' },
    });
    expect(await api.saveDocument({ projectId: 'p', key: 'k', text: '', base: null })).toEqual({
      ok: true,
      value: { path: 'k', written: false },
    });
    expect(await api.saveDraft({ projectId: 'p', key: 'k', text: '', base: null })).toEqual(
      ok(null),
    );
    expect(await api.discardDraft({ projectId: 'p', key: 'k' })).toEqual(ok(null));
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
        readDocumentPair: () => {
          throw new Error('sync boom');
        },
        suggestTargetLanguages: () => {
          throw new Error('sync boom');
        },
        searchTargetLanguages: () => {
          throw new Error('sync boom');
        },
        chooseTargetLocale: () => {
          throw new Error('sync boom');
        },
        saveDocument: () => {
          throw new Error('sync boom');
        },
        saveDraft: () => {
          throw new Error('sync boom');
        },
        discardDraft: () => {
          throw new Error('sync boom');
        },
      },
    ],
    [
      'rejects',
      {
        openProject: () => Promise.reject(new Error('async boom')),
        listSourceDocuments: () => Promise.reject(new Error('async boom')),
        readDocumentPair: () => Promise.reject(new Error('async boom')),
        suggestTargetLanguages: () => Promise.reject(new Error('async boom')),
        searchTargetLanguages: () => Promise.reject(new Error('async boom')),
        chooseTargetLocale: () => Promise.reject(new Error('async boom')),
        saveDocument: () => Promise.reject(new Error('async boom')),
        saveDraft: () => Promise.reject(new Error('async boom')),
        discardDraft: () => Promise.reject(new Error('async boom')),
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
    expect(await api.readDocumentPair({ projectId: 'p', key: 'k' })).toEqual(unexpected);
    expect(
      await api.suggestTargetLanguages({
        projectId: 'p',
        recent: [],
        systemLanguages: [],
        uiLanguage: 'en',
      }),
    ).toEqual(unexpected);
    expect(
      await api.searchTargetLanguages({ projectId: 'p', query: 'x', uiLanguage: 'en' }),
    ).toEqual(unexpected);
    expect(await api.chooseTargetLocale({ projectId: 'p', language: 'he' })).toEqual(unexpected);
    expect(await api.saveDocument({ projectId: 'p', key: 'k', text: '', base: null })).toEqual(
      unexpected,
    );
    expect(await api.saveDraft({ projectId: 'p', key: 'k', text: '', base: null })).toEqual(
      unexpected,
    );
    expect(await api.discardDraft({ projectId: 'p', key: 'k' })).toEqual(unexpected);
    expect(calls.map(([method]) => method)).toEqual([
      'openProject',
      'listSourceDocuments',
      'readDocumentPair',
      'suggestTargetLanguages',
      'searchTargetLanguages',
      'chooseTargetLocale',
      'saveDocument',
      'saveDraft',
      'discardDraft',
    ]);
    expect(calls[0]?.[1]).toBeInstanceOf(Error);
  });
});
