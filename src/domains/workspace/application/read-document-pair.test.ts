// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { documentKey, type SourceDocument } from '#domains/document';
import { createFormatRegistry, type PluginModule } from '#domains/formats';
import { FakeMarkdownParser } from '#domain-testing/document';
import { detects, fakeDocumentPlugin, type FileTree } from '#domain-testing/formats';
import { err, ok } from '#kernel/result';
import { localeId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createOpenProject } from './open-project.ts';
import { createReadDocumentPair } from './read-document-pair.ts';

const config = { 'paperl10n.config.json': JSON.stringify({ targetLocale: 'he' }) };

async function openWith(
  tree: FileTree,
  plugin = fakeDocumentPlugin('format-fake', detects('likely')),
) {
  const registry = createFormatRegistry([plugin], { apiVersion: 2 });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({ '/p': { ...config, ...tree } }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const parser = new FakeMarkdownParser();
  return {
    read: createReadDocumentPair({ sessions, parser }),
    parser,
    projectId: opened.value.projectId,
  };
}

/** A plugin whose single document lives at `path`, with its translation at `he/<path>`. */
function pluginWithDocumentAt(path: string): PluginModule {
  return fakeDocumentPlugin('format-fake', {
    ...detects('likely'),
    open: () => {
      const key = documentKey('page');
      const source = projectPath(path);
      const target = projectPath(`he/${path}`);
      const english = localeId('en');
      if (!key.ok || !source.ok || !target.ok || !english.ok) throw new Error('test setup');
      const document: SourceDocument = {
        key: key.value,
        path: source.value,
        locale: english.value,
      };
      return Promise.resolve(
        ok({
          locales: [],
          listSourceDocuments: () => Promise.resolve(ok([document])),
          targetPathFor: () => ok(target.value),
        }),
      );
    },
  });
}

describe('readDocumentPair', () => {
  it('reads and parses the source and the translation', async () => {
    const { read, projectId } = await openWith({
      'en/guide/intro.md': '# Intro\n',
      'he/guide/intro.md': '# מבוא\n',
    });
    const pair = await read(projectId, 'guide/intro');
    expect(pair).toEqual({
      ok: true,
      value: {
        key: 'guide/intro',
        source: {
          path: 'en/guide/intro.md',
          document: {
            text: '# Intro\n',
            blocks: [{ kind: 'paragraph', range: { start: 0, end: 7 } }],
            inline: [],
          },
        },
        target: {
          path: 'he/guide/intro.md',
          document: {
            text: '# מבוא\n',
            blocks: [{ kind: 'paragraph', range: { start: 0, end: 6 } }],
            inline: [],
          },
        },
      },
    });
  });

  it('gives a null translation when its file does not exist yet', async () => {
    const { read, projectId } = await openWith({ 'en/index.md': 'Hello\n' });
    const pair = await read(projectId, 'index');
    expect(pair.ok && pair.value.target).toBeNull();
    expect(pair.ok && pair.value.source.document.text).toBe('Hello\n');
  });

  it.each([
    ['plain Markdown for .md files', 'docs/page.md', false],
    ['MDX tolerance for .mdx files', 'docs/page.mdx', true],
  ])('parses with %s', async (_description, path, mdx) => {
    const { read, parser, projectId } = await openWith(
      { [path]: 'x', [`he/${path}`]: 'y' },
      pluginWithDocumentAt(path),
    );
    await read(projectId, 'page');
    expect(parser.calls.map((call) => call.options.mdx)).toEqual([mdx, mdx]);
  });

  it('reports an unknown project', async () => {
    const { read } = await openWith({ 'en/index.md': '' });
    expect(await read('nope', 'index')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });

  it('reports a project without a target language yet', async () => {
    const { read, projectId } = await openWith({
      'paperl10n.config.json': '{}',
      'en/index.md': '',
    });
    expect(await read(projectId, 'index')).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });

  it('reports a key that is not one of the project documents', async () => {
    const { read, projectId } = await openWith({ 'en/index.md': '' });
    expect(await read(projectId, 'missing/page')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-document', key: 'missing/page' },
    });
  });

  it.each([
    ['source', { 'en/index.md': new Uint8Array([0xff, 0xfe]) }, 'en/index.md'],
    ['translation', { 'en/index.md': 'ok', 'he/index.md': new Uint8Array([0xff]) }, 'he/index.md'],
  ])('reports an unreadable %s file', async (_which, tree, path) => {
    const { read, projectId } = await openWith(tree);
    expect(await read(projectId, 'index')).toEqual({
      ok: false,
      error: { code: 'workspace.document-unreadable', cause: { code: 'files.not-utf8', path } },
    });
  });

  it('reports a listed source file that has disappeared as unreadable', async () => {
    const { read, projectId } = await openWith({}, pluginWithDocumentAt('docs/gone.md'));
    expect(await read(projectId, 'page')).toEqual({
      ok: false,
      error: {
        code: 'workspace.document-unreadable',
        cause: { code: 'files.not-found', path: 'docs/gone.md' },
      },
    });
  });

  it('passes listing and target path errors through, with the format id', async () => {
    const failing = fakeDocumentPlugin('format-fake', {
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
    const listing = await openWith({}, failing);
    expect(await listing.read(listing.projectId, 'index')).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no docs', formatId: 'format-fake' },
    });

    const base = fakeDocumentPlugin('format-fake').create({ apiVersion: 2 });
    if (base.kind !== 'document') throw new Error('test setup');
    const noTarget = fakeDocumentPlugin('format-fake', {
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
    const target = await openWith({ 'en/index.md': '' }, noTarget);
    expect(await target.read(target.projectId, 'index')).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no target', formatId: 'format-fake' },
    });
  });
});
