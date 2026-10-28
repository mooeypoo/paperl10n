// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type PluginModule } from '#domains/formats';
import { detects, fakeDocumentPlugin } from '#domain-testing/formats';
import { err, ok } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createListSourceDocuments } from './list-source-documents.ts';
import { createOpenProject } from './open-project.ts';

/** Opens a project through the real use case, so the session is exactly what the app stores. */
async function openWith(plugin: PluginModule) {
  const registry = createFormatRegistry([plugin], { apiVersion: 1 });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({
      '/p': {
        'paperl10n.config.json': JSON.stringify({ targetLocale: 'he' }),
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
    listSourceDocuments: createListSourceDocuments({ sessions }),
    projectId: opened.value.projectId,
  };
}

describe('listSourceDocuments', () => {
  it('lists source documents with their target paths, and whether each translation exists', async () => {
    const { listSourceDocuments, projectId } = await openWith(
      fakeDocumentPlugin('format-fake', detects('likely')),
    );
    expect(await listSourceDocuments(projectId)).toEqual({
      ok: true,
      value: [
        {
          key: 'guide/intro',
          sourcePath: 'en/guide/intro.md',
          targetPath: 'he/guide/intro.md',
          targetExists: false,
        },
        { key: 'index', sourcePath: 'en/index.md', targetPath: 'he/index.md', targetExists: true },
      ],
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

  it('passes a listing error from the format through, with the format id', async () => {
    const plugin = fakeDocumentPlugin('format-fake', {
      ...detects('likely'),
      open: () =>
        Promise.resolve(
          ok({
            declaredLocales: [],
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
    const base = fakeDocumentPlugin('format-fake').create({ apiVersion: 1 });
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
});
