// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type PluginModule } from '#domains/formats';
import { detects, fakeDocumentPlugin } from '#domain-testing/formats';
import { LineMarkdownParser } from '#domain-testing/document';
import { err, ok } from '#kernel/result';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import {
  FakeFolderPicker,
  FakeProjectFilesOpener,
  unavailableDraftStore,
} from '../testing/fakes.ts';
import type { DraftStore } from './ports/draft-store.ts';
import { createChooseTargetLocale } from './choose-target-locale.ts';
import { createListSourceDocuments } from './list-source-documents.ts';
import { createOpenProject } from './open-project.ts';

/** Opens a project through the real use case, so the session is exactly what the app stores. */
async function openWith(
  plugin: PluginModule,
  settings: object = { targetLocale: 'he' },
  drafts: DraftStore = new InMemoryDraftStore(),
) {
  const registry = createFormatRegistry([plugin], { apiVersion: 3 });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({
      '/p': {
        'paperl10n.config.json': JSON.stringify(settings),
        'en/index.md': '',
        'en/guide/intro.md': '',
        'he/index.md': '',
      },
    }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  return {
    listSourceDocuments: createListSourceDocuments({
      sessions,
      drafts,
      parser: new LineMarkdownParser(),
    }),
    drafts,
    projectId: opened.value.projectId,
    sessions,
  };
}

describe('listSourceDocuments', () => {
  it('lists source documents with their target paths, whether each translation exists, and status', async () => {
    const { listSourceDocuments, projectId } = await openWith(
      fakeDocumentPlugin('format-fake', detects('likely')),
    );
    expect(await listSourceDocuments(projectId)).toEqual({
      ok: true,
      value: {
        documents: [
          {
            key: 'guide/intro',
            sourcePath: 'en/guide/intro.md',
            targetPath: 'he/guide/intro.md',
            targetExists: false,
            hasDraft: false,
            status: 'missing',
          },
          {
            key: 'index',
            sourcePath: 'en/index.md',
            targetPath: 'he/index.md',
            targetExists: true,
            hasDraft: false,
            status: 'draft',
          },
        ],
        statusFile: { exists: false, problem: null },
      },
    });
  });

  it('reports an unknown project id', async () => {
    const { listSourceDocuments } = await openWith(
      fakeDocumentPlugin('format-fake', detects('likely')),
    );
    expect(await listSourceDocuments('not-a-project')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });

  it('reports a project without a target language yet', async () => {
    const { listSourceDocuments, projectId } = await openWith(
      fakeDocumentPlugin('format-fake', detects('likely')),
      {},
    );
    expect(await listSourceDocuments(projectId)).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });

  it('lists against a target chosen after opening', async () => {
    const plugin = fakeDocumentPlugin('format-fake', detects('likely'));
    const { listSourceDocuments, projectId, sessions } = await openWith(plugin, {});
    expect((await createChooseTargetLocale({ sessions })(projectId, 'ar')).ok).toBe(true);
    const listed = await listSourceDocuments(projectId);
    expect(listed.ok && listed.value.documents.map((entry) => entry.targetPath)).toEqual([
      'ar/guide/intro.md',
      'ar/index.md',
    ]);
  });

  it('passes a listing error from the format through, with the format id', async () => {
    const plugin = fakeDocumentPlugin('format-fake', {
      ...detects('likely'),
      open: () =>
        Promise.resolve(
          ok({
            locales: [],
            listSourceDocuments: () =>
              Promise.resolve(err({ code: 'formats.unsupported-project', reason: 'no docs' })),
            targetPathFor: () => err({ code: 'formats.unsupported-project', reason: 'unused' }),
          }),
        ),
    });
    const { listSourceDocuments, projectId } = await openWith(plugin);
    expect(await listSourceDocuments(projectId)).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no docs', formatId: 'format-fake' },
    });
  });

  it('passes a target path error through, with the format id', async () => {
    const base = fakeDocumentPlugin('format-fake').create({ apiVersion: 3 });
    if (base.kind !== 'document') throw new Error('test setup');
    const plugin = fakeDocumentPlugin('format-fake', {
      ...detects('likely'),
      open: async (context) => {
        const layout = await base.open(context);
        if (!layout.ok) return layout;
        return ok({
          ...layout.value,
          targetPathFor: () => err({ code: 'formats.unsupported-project', reason: 'no target' }),
        });
      },
    });
    const { listSourceDocuments, projectId } = await openWith(plugin);
    expect(await listSourceDocuments(projectId)).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no target', formatId: 'format-fake' },
    });
  });

  it("says which pages have a draft (this project's, in its target language)", async () => {
    const plugin = fakeDocumentPlugin('format-fake', detects('likely'));
    const { listSourceDocuments, projectId, drafts } = await openWith(plugin);
    await drafts.put({ project: '/p', locale: 'he', document: 'index' }, { text: 'x', base: null });
    await drafts.put(
      { project: '/p', locale: 'ar', document: 'guide/intro' },
      { text: 'x', base: null },
    );
    await drafts.put(
      { project: '/q', locale: 'he', document: 'guide/intro' },
      { text: 'x', base: null },
    );
    const listed = await listSourceDocuments(projectId);
    expect(listed.ok && listed.value.documents.map((entry) => [entry.key, entry.hasDraft])).toEqual(
      [
        ['guide/intro', false],
        ['index', true],
      ],
    );
  });

  it('still lists the pages when drafts cannot be listed', async () => {
    const plugin = fakeDocumentPlugin('format-fake', detects('likely'));
    const { listSourceDocuments, projectId } = await openWith(
      plugin,
      undefined,
      unavailableDraftStore,
    );
    const listed = await listSourceDocuments(projectId);
    expect(listed.ok && listed.value.documents.map((entry) => entry.hasDraft)).toEqual([
      false,
      false,
    ]);
  });
});
