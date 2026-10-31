// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import { detects, fakeDocumentPlugin } from '#domain-testing/formats';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import {
  FakeFolderPicker,
  FakeProjectFilesOpener,
  unavailableDraftStore,
} from '../testing/fakes.ts';
import { createDiscardDraft, createSaveDraft } from './drafts.ts';
import { createOpenProject } from './open-project.ts';
import type { DraftStore } from './ports/draft-store.ts';

async function opened(
  settings: object = { targetLocale: 'he' },
  drafts: DraftStore = new InMemoryDraftStore(),
) {
  const registry = createFormatRegistry([fakeDocumentPlugin('format-fake', detects('likely'))], {
    apiVersion: 3,
  });
  if (!registry.ok) throw new Error('test setup: registry');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const summary = await createOpenProject({
    folderPicker: new FakeFolderPicker('/home/me/docs'),
    opener: new FakeProjectFilesOpener({
      '/home/me/docs': { 'paperl10n.config.json': JSON.stringify(settings), 'en/index.md': '' },
    }),
    registry: registry.value,
    sessions,
  })();
  if (!summary.ok || summary.value === null) throw new Error('test setup: open');
  return {
    projectId: summary.value.projectId,
    drafts,
    saveDraft: createSaveDraft({ sessions, drafts }),
    discardDraft: createDiscardDraft({ sessions, drafts }),
  };
}

const key = { project: '/home/me/docs', locale: 'he', document: 'index' };

describe('saveDraft and discardDraft', () => {
  it("keep and forget a page's draft under the project's location and target language", async () => {
    const { projectId, drafts, saveDraft, discardDraft } = await opened();
    expect(await saveDraft(projectId, { key: 'index', text: 'בית!\r\n', base: 'בית\r\n' })).toEqual(
      {
        ok: true,
        value: undefined,
      },
    );
    expect(await drafts.get(key)).toEqual({
      ok: true,
      value: { text: 'בית!\r\n', base: 'בית\r\n' },
    });
    expect(await discardDraft(projectId, 'index')).toEqual({ ok: true, value: undefined });
    expect(await drafts.get(key)).toEqual({ ok: true, value: null });
  });

  it('keep a draft for a page that is not listed (the page may be new, or gone)', async () => {
    const { projectId, drafts, saveDraft } = await opened();
    await saveDraft(projectId, { key: 'guide/new', text: 'x', base: null });
    expect(await drafts.get({ ...key, document: 'guide/new' })).toEqual({
      ok: true,
      value: { text: 'x', base: null },
    });
  });

  it.each(['', '../outside', '/abs'])('refuse a malformed page key: %j', async (bad) => {
    const { projectId, saveDraft, discardDraft } = await opened();
    const refused = { ok: false, error: { code: 'workspace.unknown-document', key: bad } };
    expect(await saveDraft(projectId, { key: bad, text: 'x', base: null })).toEqual(refused);
    expect(await discardDraft(projectId, bad)).toEqual(refused);
  });

  it('report a project that is not open, or has no target language', async () => {
    const { saveDraft, discardDraft } = await opened();
    const unknown = { ok: false, error: { code: 'workspace.unknown-project' } };
    expect(await saveDraft('nope', { key: 'index', text: 'x', base: null })).toEqual(unknown);
    expect(await discardDraft('nope', 'index')).toEqual(unknown);
    const withoutTarget = await opened({});
    const noTarget = { ok: false, error: { code: 'workspace.no-target-locale' } };
    expect(
      await withoutTarget.saveDraft(withoutTarget.projectId, {
        key: 'index',
        text: 'x',
        base: null,
      }),
    ).toEqual(noTarget);
    expect(await withoutTarget.discardDraft(withoutTarget.projectId, 'index')).toEqual(noTarget);
  });

  it('report storage that fails', async () => {
    const { projectId, saveDraft, discardDraft } = await opened(undefined, unavailableDraftStore);
    const failed = { ok: false, error: { code: 'workspace.draft-unwritable' } };
    expect(await saveDraft(projectId, { key: 'index', text: 'x', base: null })).toEqual(failed);
    expect(await discardDraft(projectId, 'index')).toEqual(failed);
  });
});
