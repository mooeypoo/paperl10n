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
            ok({
              documents: [
                {
                  key: projectId,
                  sourcePath: 'a',
                  targetPath: 'b',
                  targetExists: false,
                  hasDraft: false,
                  status: 'missing',
                },
              ],
              statusFile: { exists: false, problem: null },
            }),
          ),
        listCatalogs: ({ projectId }) =>
          Promise.resolve(
            ok({
              catalogs: [
                {
                  key: projectId,
                  sourcePath: 'a',
                  targetPath: 'b',
                  targetExists: false,
                  progress: null,
                  problem: null,
                },
              ],
              statusFile: { exists: false, problem: null },
            }),
          ),
        readCatalog: ({ key }) =>
          Promise.resolve(
            ok({
              key,
              sourcePath: 'i18n/en.json',
              targetPath: 'i18n/he.json',
              targetExists: true,
              documentationPath: null,
              messages: [],
              notInSource: [],
              documentationProblem: null,
              statusFile: { exists: false, problem: null },
            }),
          ),
        readDocumentPair: ({ key }) =>
          Promise.resolve(
            ok({
              key,
              source: { path: 'a', mdx: false, text: '', blocks: [], inline: [] },
              target: null,
              draft: null,
              sections: { paired: true, level: null, pairs: [] },
              status: {
                page: 'missing',
                sections: [],
                changes: { blocks: [], removals: [] },
                sourceFingerprint: 'f',
              },
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
        checkTranslation: () =>
          Promise.resolve(ok({ page: [], sections: null, length: { source: 3, translation: 2 } })),
        markUpToDate: () =>
          Promise.resolve(
            ok({
              page: 'translated',
              sections: ['translated'],
              changes: { blocks: [], removals: [] },
            }),
          ),
        markExistingUpToDate: () => Promise.resolve(ok({ marked: ['k'] })),
      },
      onUnexpected,
    );
    expect(await api.openProject()).toEqual({ ok: true, value: null });
    expect(await api.listSourceDocuments({ projectId: 'p' })).toEqual({
      ok: true,
      value: {
        documents: [
          {
            key: 'p',
            sourcePath: 'a',
            targetPath: 'b',
            targetExists: false,
            hasDraft: false,
            status: 'missing',
          },
        ],
        statusFile: { exists: false, problem: null },
      },
    });
    expect(await api.listCatalogs({ projectId: 'p' })).toEqual({
      ok: true,
      value: {
        catalogs: [
          {
            key: 'p',
            sourcePath: 'a',
            targetPath: 'b',
            targetExists: false,
            progress: null,
            problem: null,
          },
        ],
        statusFile: { exists: false, problem: null },
      },
    });
    expect(await api.readCatalog({ projectId: 'p', key: 'i18n' })).toEqual(
      ok({
        key: 'i18n',
        sourcePath: 'i18n/en.json',
        targetPath: 'i18n/he.json',
        targetExists: true,
        documentationPath: null,
        messages: [],
        notInSource: [],
        documentationProblem: null,
        statusFile: { exists: false, problem: null },
      }),
    );
    expect(await api.readDocumentPair({ projectId: 'p', key: 'k' })).toEqual({
      ok: true,
      value: {
        key: 'k',
        source: { path: 'a', mdx: false, text: '', blocks: [], inline: [] },
        target: null,
        draft: null,
        sections: { paired: true, level: null, pairs: [] },
        status: {
          page: 'missing',
          sections: [],
          changes: { blocks: [], removals: [] },
          sourceFingerprint: 'f',
        },
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
    expect(await api.checkTranslation({ projectId: 'p', key: 'k', text: 'x' })).toEqual(
      ok({ page: [], sections: null, length: { source: 3, translation: 2 } }),
    );
    expect(
      await api.markUpToDate({ projectId: 'p', key: 'k', sourceFingerprint: 'f', sections: null }),
    ).toEqual(
      ok({ page: 'translated', sections: ['translated'], changes: { blocks: [], removals: [] } }),
    );
    expect(await api.markExistingUpToDate({ projectId: 'p' })).toEqual(ok({ marked: ['k'] }));
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
        listCatalogs: () => {
          throw new Error('sync boom');
        },
        readCatalog: () => {
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
        markUpToDate: () => {
          throw new Error('sync boom');
        },
        markExistingUpToDate: () => {
          throw new Error('sync boom');
        },
        checkTranslation: () => {
          throw new Error('sync boom');
        },
      },
    ],
    [
      'rejects',
      {
        openProject: () => Promise.reject(new Error('async boom')),
        listSourceDocuments: () => Promise.reject(new Error('async boom')),
        listCatalogs: () => Promise.reject(new Error('async boom')),
        readCatalog: () => Promise.reject(new Error('async boom')),
        readDocumentPair: () => Promise.reject(new Error('async boom')),
        suggestTargetLanguages: () => Promise.reject(new Error('async boom')),
        searchTargetLanguages: () => Promise.reject(new Error('async boom')),
        chooseTargetLocale: () => Promise.reject(new Error('async boom')),
        saveDocument: () => Promise.reject(new Error('async boom')),
        saveDraft: () => Promise.reject(new Error('async boom')),
        discardDraft: () => Promise.reject(new Error('async boom')),
        markUpToDate: () => Promise.reject(new Error('async boom')),
        markExistingUpToDate: () => Promise.reject(new Error('async boom')),
        checkTranslation: () => Promise.reject(new Error('async boom')),
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
    expect(await api.listCatalogs({ projectId: 'p' })).toEqual(unexpected);
    expect(await api.readCatalog({ projectId: 'p', key: 'i18n' })).toEqual(unexpected);
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
    expect(
      await api.markUpToDate({ projectId: 'p', key: 'k', sourceFingerprint: 'f', sections: [0] }),
    ).toEqual(unexpected);
    expect(await api.markExistingUpToDate({ projectId: 'p' })).toEqual(unexpected);
    expect(await api.checkTranslation({ projectId: 'p', key: 'k', text: 'x' })).toEqual(unexpected);
    expect(calls.map(([method]) => method)).toEqual([
      'openProject',
      'listSourceDocuments',
      'listCatalogs',
      'readCatalog',
      'readDocumentPair',
      'suggestTargetLanguages',
      'searchTargetLanguages',
      'chooseTargetLocale',
      'saveDocument',
      'saveDraft',
      'discardDraft',
      'markUpToDate',
      'markExistingUpToDate',
      'checkTranslation',
    ]);
    expect(calls[0]?.[1]).toBeInstanceOf(Error);
  });
});
