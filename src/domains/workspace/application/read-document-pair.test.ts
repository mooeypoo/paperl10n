// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { documentKey, type SourceDocument } from '#domains/document';
import { createFormatRegistry, type PluginModule } from '#domains/formats';
import { FakeMarkdownParser, LineMarkdownParser } from '#domain-testing/document';
import { detects, fakeDocumentPlugin, type FileTree } from '#domain-testing/formats';
import { err, ok } from '#kernel/result';
import { localeId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import {
  FakeFolderPicker,
  FakeProjectFilesOpener,
  unavailableDraftStore,
} from '../testing/fakes.ts';
import type { DraftStore } from './ports/draft-store.ts';
import { createOpenProject } from './open-project.ts';
import { createReadDocumentPair } from './read-document-pair.ts';

const config = { 'paperl10n.config.json': JSON.stringify({ targetLocale: 'he' }) };

async function openWith(
  tree: FileTree,
  plugin = fakeDocumentPlugin('format-fake', detects('likely')),
  drafts: DraftStore = new InMemoryDraftStore(),
  parser = new FakeMarkdownParser(),
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
  return {
    read: createReadDocumentPair({ sessions, parser, drafts }),
    drafts,
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
          mdx: false,
          document: {
            text: '# Intro\n',
            blocks: [{ kind: 'paragraph', range: { start: 0, end: 7 } }],
            inline: [],
            preserved: [],
          },
        },
        target: {
          path: 'he/guide/intro.md',
          mdx: false,
          document: {
            text: '# מבוא\n',
            blocks: [{ kind: 'paragraph', range: { start: 0, end: 6 } }],
            inline: [],
            preserved: [],
          },
        },
        draft: null,
        sections: expect.objectContaining({ paired: true }) as unknown,
        status: {
          page: 'draft',
          sections: ['draft'],
          changes: { blocks: [], removals: [] },
          sourceFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/) as string,
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
    const pair = await read(projectId, 'page');
    expect(parser.calls.map((call) => call.options.mdx)).toEqual([mdx, mdx]);
    // And says so, so an editor parses the file the same way.
    expect(pair.ok && [pair.value.source.mdx, pair.value.target?.mdx]).toEqual([mdx, mdx]);
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

  describe('pairs sections with the text the translation opens with', () => {
    const headingParser = new LineMarkdownParser();
    const source = '## A\na\n## B\nb\n';
    const counts = async (tree: FileTree, draft?: string) => {
      const drafts = new InMemoryDraftStore();
      const { read, projectId } = await openWith(tree, undefined, drafts, headingParser);
      if (draft !== undefined) {
        await drafts.put(
          { project: '/p', locale: 'he', document: 'index' },
          { text: draft, base: null },
        );
      }
      const pair = await read(projectId, 'index');
      if (!pair.ok) throw new Error('test setup');
      const { sections } = pair.value;
      return sections.paired
        ? sections.pairs.map((p) => [p.source?.range.start ?? null, p.target?.range.start ?? null])
        : {
            reason: sections.reason,
            sourceCount: sections.sourceCount,
            targetCount: sections.targetCount,
          };
    };

    it('the file', async () => {
      expect(await counts({ 'en/index.md': source, 'he/index.md': '## א\n## ב\n' })).toEqual([
        [0, 0],
        [7, 5],
      ]);
    });

    it('the draft, over the file', async () => {
      expect(
        await counts({ 'en/index.md': source, 'he/index.md': '## א\n## ב\n' }, '## א\n'),
      ).toEqual({ reason: 'count', sourceCount: 2, targetCount: 1 });
    });

    it('a copy of the source, for a translation not started yet', async () => {
      expect(await counts({ 'en/index.md': source })).toEqual([
        [0, 0],
        [7, 7],
      ]);
    });

    it('says when the file’s sections don’t pair', async () => {
      expect(await counts({ 'en/index.md': source, 'he/index.md': 'רק טקסט\n' })).toEqual({
        reason: 'level',
        sourceCount: 2,
        targetCount: 0,
      });
    });
  });

  describe('with a draft', () => {
    const draftOf = (document: string) => ({ project: '/p', locale: 'he', document });
    const tree = { 'en/index.md': 'Home\n', 'he/index.md': 'בית\n', 'en/about.md': 'About\n' };

    it('brings the draft along: for an existing translation, and for a new one', async () => {
      const { read, drafts, projectId } = await openWith(tree);
      await drafts.put(draftOf('index'), { text: 'בית!\n', base: 'בית\n' });
      await drafts.put(draftOf('about'), { text: 'אודות\n', base: null });
      const index = await read(projectId, 'index');
      expect(index.ok && index.value.draft).toEqual({ text: 'בית!\n', base: 'בית\n' });
      const about = await read(projectId, 'about');
      expect(about.ok && [about.value.target, about.value.draft]).toEqual([
        null,
        { text: 'אודות\n', base: null },
      ]);
    });

    it('forgets a draft that holds what the file already says', async () => {
      const { read, drafts, projectId } = await openWith(tree);
      await drafts.put(draftOf('index'), { text: 'בית\n', base: 'old' });
      const pair = await read(projectId, 'index');
      expect(pair.ok && pair.value.draft).toBeNull();
      expect(await drafts.get(draftOf('index'))).toEqual({ ok: true, value: null });
    });

    it("ignores another language's draft", async () => {
      const { read, drafts, projectId } = await openWith(tree);
      await drafts.put({ ...draftOf('index'), locale: 'ar' }, { text: 'x', base: null });
      const pair = await read(projectId, 'index');
      expect(pair.ok && pair.value.draft).toBeNull();
    });

    it('still opens the page when drafts cannot be read', async () => {
      const { read, projectId } = await openWith(tree, undefined, unavailableDraftStore);
      const pair = await read(projectId, 'index');
      expect(pair.ok && [pair.value.target?.document.text, pair.value.draft]).toEqual([
        'בית\n',
        null,
      ]);
    });
  });
});
