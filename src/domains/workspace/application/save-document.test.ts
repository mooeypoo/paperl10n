// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import { detects, fakeDocumentPlugin, type FileTree } from '#domain-testing/formats';
import { projectPath } from '#kernel/project-path';
import { err } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createOpenProject } from './open-project.ts';
import { createSaveDocument } from './save-document.ts';

const path = (raw: string) => {
  const parsed = projectPath(raw);
  if (!parsed.ok) throw new Error(`test setup: ${raw}`);
  return parsed.value;
};

/** Opens a project (en → he, one translated page) and returns saving and a way to read files. */
async function opened(tree: FileTree = {}, settings: object = { targetLocale: 'he' }) {
  const registry = createFormatRegistry([fakeDocumentPlugin('format-fake', detects('likely'))], {
    apiVersion: 2,
  });
  if (!registry.ok) throw new Error('test setup: registry');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opener = new FakeProjectFilesOpener({
    '/p': {
      'paperl10n.config.json': JSON.stringify(settings),
      'en/index.md': '# Home\n',
      'en/guide/intro.md': '# Intro\n',
      'he/index.md': '# בית\r\n',
      ...tree,
    },
  });
  const summary = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener,
    registry: registry.value,
    sessions,
  })();
  if (!summary.ok || summary.value === null) throw new Error('test setup: open');
  const files = opener.opened.get('/p');
  if (files === undefined) throw new Error('test setup: files');
  const read = async (raw: string) => {
    const text = await files.readText(path(raw));
    return text.ok ? text.value : null;
  };
  return {
    projectId: summary.value.projectId,
    sessions,
    files,
    read,
    save: createSaveDocument({ sessions }),
  };
}

describe('saveDocument', () => {
  it("writes the translation exactly as given, at the target locale's path", async () => {
    const { projectId, save, read } = await opened();
    expect(
      await save(projectId, { key: 'index', text: '# בית\r\n\r\nשלום\r\n', base: '# בית\r\n' }),
    ).toEqual({
      ok: true,
      value: { path: 'he/index.md', written: true },
    });
    expect(await read('he/index.md')).toBe('# בית\r\n\r\nשלום\r\n');
    expect(await read('en/index.md')).toBe('# Home\n');
  });

  it('creates a new translation, and its folders, when there was none', async () => {
    const { projectId, save, read } = await opened();
    expect(await save(projectId, { key: 'guide/intro', text: '# מבוא\n', base: null })).toEqual({
      ok: true,
      value: { path: 'he/guide/intro.md', written: true },
    });
    expect(await read('he/guide/intro.md')).toBe('# מבוא\n');
  });

  it('writes nothing when the text is what the file already says', async () => {
    const { projectId, save, files } = await opened();
    let writes = 0;
    const original = files.writeText.bind(files);
    files.writeText = (...args) => {
      writes++;
      return original(...args);
    };
    expect(await save(projectId, { key: 'index', text: '# בית\r\n', base: '# בית\r\n' })).toEqual({
      ok: true,
      value: { path: 'he/index.md', written: false },
    });
    expect(writes).toBe(0);
  });

  it.each<
    [
      string,
      string | null,
      (files: Awaited<ReturnType<typeof opened>>['files']) => Promise<unknown>,
    ]
  >([
    [
      'changed on disk since editing started',
      '# בית\r\n',
      (files) => files.writeText(path('he/index.md'), '# בית (עודכן)\n'),
    ],
    ['created on disk since a seeded page was opened', null, () => Promise.resolve()],
  ])(
    'refuses to overwrite a translation %s, changing nothing',
    async (_description, base, change) => {
      const { projectId, save, files, read } = await opened();
      await change(files);
      const before = await read('he/index.md');
      expect(await save(projectId, { key: 'index', text: 'mine', base })).toEqual({
        ok: false,
        error: { code: 'workspace.document-changed', path: 'he/index.md' },
      });
      expect(await read('he/index.md')).toBe(before);
    },
  );

  it('refuses when the translation was deleted on disk since editing started', async () => {
    const { projectId, save, sessions } = await opened();
    const project = sessions.get(projectId);
    if (project === undefined) throw new Error('test setup');
    sessions.update(projectId, {
      ...project,
      files: {
        ...project.files,
        readText: (p) => Promise.resolve(err({ code: 'files.not-found', path: p })),
      },
    });
    expect(await save(projectId, { key: 'index', text: 'mine', base: '# בית\r\n' })).toEqual({
      ok: false,
      error: { code: 'workspace.document-changed', path: 'he/index.md' },
    });
  });

  it.each<[string, Parameters<ReturnType<typeof createSaveDocument>>[1], unknown]>([
    [
      'a key that is not one of the pages',
      { key: 'nope', text: 'x', base: null },
      { code: 'workspace.unknown-document', key: 'nope' },
    ],
  ])('reports %s', async (_description, request, error) => {
    const { projectId, save } = await opened();
    expect(await save(projectId, request)).toEqual({ ok: false, error });
  });

  it('reports a project that is not open, or has no target language', async () => {
    const { save } = await opened();
    expect(await save('nope', { key: 'index', text: 'x', base: null })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
    const withoutTarget = await opened({}, {});
    expect(
      await withoutTarget.save(withoutTarget.projectId, { key: 'index', text: 'x', base: null }),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });

  it('reports a translation that cannot be read, or written', async () => {
    const { projectId, save, sessions } = await opened();
    const project = sessions.get(projectId);
    if (project === undefined) throw new Error('test setup');
    sessions.update(projectId, {
      ...project,
      files: {
        ...project.files,
        readText: (p) => Promise.resolve(err({ code: 'files.unreadable', path: p })),
      },
    });
    expect(await save(projectId, { key: 'index', text: 'x', base: '# בית\r\n' })).toEqual({
      ok: false,
      error: {
        code: 'workspace.document-unreadable',
        cause: { code: 'files.unreadable', path: 'he/index.md' },
      },
    });
    sessions.update(projectId, {
      ...project,
      writer: { writeText: (p) => Promise.resolve(err({ code: 'files.unwritable', path: p })) },
    });
    expect(await save(projectId, { key: 'index', text: 'x', base: '# בית\r\n' })).toEqual({
      ok: false,
      error: {
        code: 'workspace.document-unwritable',
        cause: { code: 'files.unwritable', path: 'he/index.md' },
      },
    });
  });

  it('passes a listing error from the format through', async () => {
    const { projectId, save, sessions } = await opened();
    const project = sessions.get(projectId);
    if (project === undefined) throw new Error('test setup');
    const failure = {
      code: 'formats.plugin-failed' as const,
      formatId: project.documentFormat.manifest.id,
      reason: 'boom',
    };
    sessions.update(projectId, {
      ...project,
      layout: { ...project.layout, listSourceDocuments: () => Promise.resolve(err(failure)) },
    });
    expect(await save(projectId, { key: 'index', text: 'x', base: null })).toEqual({
      ok: false,
      error: failure,
    });
  });
});
