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
  warnings: [],
};

const documents: SourceDocumentDto[] = [
  {
    key: 'index',
    sourcePath: 'en/index.md',
    targetPath: 'he/index.md',
    targetExists: true,
    hasDraft: false,
  },
];

function api(overrides: Partial<PaperLionApi> = {}): PaperLionApi {
  return {
    openProject: () => Promise.resolve({ ok: true, value: summary }),
    listSourceDocuments: () => Promise.resolve({ ok: true, value: documents }),
    readDocumentPair: ({ key }) =>
      Promise.resolve({
        ok: true,
        value: {
          key,
          source: { path: 'en/a.md', mdx: false, text: 'a', blocks: [], inline: [] },
          target: null,
          draft: null,
          sections: { paired: true, pairs: [] },
        },
      }),
    suggestTargetLanguages: () =>
      Promise.resolve({ ok: true, value: { inProject: [], recent: [], suggested: [] } }),
    searchTargetLanguages: () => Promise.resolve({ ok: true, value: [] }),
    saveDocument: ({ key }) => Promise.resolve({ ok: true, value: { path: key, written: true } }),
    saveDraft: () => Promise.resolve({ ok: true, value: null }),
    discardDraft: () => Promise.resolve({ ok: true, value: null }),
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

    const listed = await transport.listSourceDocuments({ projectId: 'p-1' });
    expect(listed).toEqual({ ok: true, value: documents });
    expect(listed.ok && listed.value).not.toBe(documents);
  });

  it('sends a copy of the request', async () => {
    const request = { projectId: 'p-1' };
    let received: unknown;
    const transport = cloningTransport(
      api({
        listSourceDocuments: (sent) => {
          received = sent;
          return Promise.resolve({ ok: true, value: [] });
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
