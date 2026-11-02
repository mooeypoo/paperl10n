// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { PaperLionApi, ProjectSummaryDto, SourceDocumentDto } from '#ipc-contract';
import { cloningTransport } from './cloning-transport';

const summary: ProjectSummaryDto = {
  projectId: 'p-1',
  name: 'basic',
  sourceLocale: { id: 'en', direction: 'ltr' },
  targetLocale: { id: 'he', direction: 'rtl' },
  documentFormat: { id: 'format-stub', displayName: 'Folder per locale (stub)' },
  catalogFormat: null,
  warnings: [],
};

const documents: SourceDocumentDto[] = [
  {
    key: 'index',
    sourcePath: 'en/index.md',
    targetPath: 'he/index.md',
    targetExists: true,
    hasDraft: false,
    status: 'draft',
  },
];
const listed = { documents, statusFile: { exists: true, problem: null } };

function api(overrides: Partial<PaperLionApi> = {}): PaperLionApi {
  return {
    openProject: () => Promise.resolve({ ok: true, value: summary }),
    listSourceDocuments: () => Promise.resolve({ ok: true, value: listed }),
    listCatalogs: () =>
      Promise.resolve({
        ok: true,
        value: { catalogs: [], statusFile: { exists: false, problem: null } },
      }),
    readCatalog: () => Promise.reject(new Error('not used')),
    readDocumentPair: ({ key }) =>
      Promise.resolve({
        ok: true,
        value: {
          key,
          source: { path: 'en/a.md', mdx: false, text: 'a', blocks: [], inline: [] },
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
      }),
    suggestTargetLanguages: () =>
      Promise.resolve({ ok: true, value: { inProject: [], recent: [], suggested: [] } }),
    searchTargetLanguages: () => Promise.resolve({ ok: true, value: [] }),
    saveDocument: ({ key }) => Promise.resolve({ ok: true, value: { path: key, written: true } }),
    saveDraft: () => Promise.resolve({ ok: true, value: null }),
    discardDraft: () => Promise.resolve({ ok: true, value: null }),
    checkTranslation: () =>
      Promise.resolve({
        ok: true,
        value: { page: [], sections: null, length: { source: 0, translation: 0 } },
      }),
    markUpToDate: () =>
      Promise.resolve({
        ok: true,
        value: { page: 'translated', sections: [], changes: { blocks: [], removals: [] } },
      }),
    markExistingUpToDate: () => Promise.resolve({ ok: true, value: { marked: [] } }),
    chooseTargetLocale: ({ language }) =>
      Promise.resolve({ ok: true, value: { id: language, direction: 'rtl' } }),
    ...overrides,
  };
}

describe('cloningTransport', () => {
  it('returns equal copies of results, never the objects themselves', async () => {
    const transport = cloningTransport(api());
    const opened = await transport.openProject();
    expect(opened).toEqual({ ok: true, value: summary });
    expect(opened.ok && opened.value).not.toBe(summary);

    const answer = await transport.listSourceDocuments({ projectId: 'p-1' });
    expect(answer).toEqual({ ok: true, value: listed });
    expect(answer.ok && answer.value).not.toBe(listed);
  });

  it('sends a copy of the request', async () => {
    const request = { projectId: 'p-1' };
    let received: unknown;
    const transport = cloningTransport(
      api({
        listSourceDocuments: (sent) => {
          received = sent;
          return Promise.resolve({ ok: true, value: listed });
        },
      }),
    );
    await transport.listSourceDocuments(request);
    expect(received).toEqual(request);
    expect(received).not.toBe(request);
  });

  it('rejects a result that could not cross IPC', async () => {
    const notCloneable = {
      ...summary,
      warnings: [() => 'a function'],
    } as unknown as typeof summary;
    const transport = cloningTransport(
      api({ openProject: () => Promise.resolve({ ok: true, value: notCloneable }) }),
    );
    await expect(transport.openProject()).rejects.toThrow(/could not be cloned/);
  });

  it('passes on a rejection from the API', async () => {
    const transport = cloningTransport(
      api({ openProject: () => Promise.reject(new Error('boom')) }),
    );
    await expect(transport.openProject()).rejects.toThrow('boom');
  });
});
