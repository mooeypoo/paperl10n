// SPDX-License-Identifier: GPL-3.0-or-later
// A project with message catalogs and no pages: every page use case answers as for a project
// with no pages, never crashing on the missing document layout.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import { LineMarkdownParser } from '#domain-testing/document';
import { detects, fakeCatalogPlugin } from '#domain-testing/formats';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createCheckTranslation } from './check-translation.ts';
import { createListSourceDocuments } from './list-source-documents.ts';
import { createMarkExistingUpToDate, createMarkUpToDate } from './mark-up-to-date.ts';
import { createOpenProject } from './open-project.ts';
import { createReadDocumentPair } from './read-document-pair.ts';
import { createSaveDocument } from './save-document.ts';
import { createStatusUpdates } from './translation-status.ts';

async function catalogOnly() {
  const registry = createFormatRegistry([fakeCatalogPlugin('catalog-fake', detects('likely'))], {
    apiVersion: 3,
  });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({
      '/p': {
        'paperl10n.config.json': JSON.stringify({ sourceLocale: 'en', targetLocale: 'he' }),
        'i18n/en.cat': 'a=A\n',
      },
    }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error('test setup');
  const parser = new LineMarkdownParser();
  const drafts = new InMemoryDraftStore();
  const updates = createStatusUpdates();
  return { projectId: opened.value.projectId, sessions, parser, drafts, updates };
}

const unknown = { ok: false, error: { code: 'workspace.unknown-document', key: 'index' } };

describe('a project with catalogs only', () => {
  it('lists no pages, and marks none up to date', async () => {
    const deps = await catalogOnly();
    expect(await createListSourceDocuments(deps)(deps.projectId)).toEqual({
      ok: true,
      value: { documents: [], statusFile: { exists: false, problem: null } },
    });
    expect(await createMarkExistingUpToDate(deps)(deps.projectId)).toEqual({
      ok: true,
      value: { marked: [] },
    });
  });

  it('answers every page request as for a page it does not have', async () => {
    const deps = await catalogOnly();
    const { projectId } = deps;
    expect(await createReadDocumentPair(deps)(projectId, 'index')).toEqual(unknown);
    expect(
      await createSaveDocument(deps)(projectId, { key: 'index', text: 'x', base: null }),
    ).toEqual(unknown);
    expect(await createCheckTranslation(deps)(projectId, { key: 'index', text: 'x' })).toEqual(
      unknown,
    );
    expect(
      await createMarkUpToDate(deps)(projectId, {
        key: 'index',
        sourceFingerprint: 'f',
        sections: null,
      }),
    ).toEqual(unknown);
  });
});
