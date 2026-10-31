// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  documentKey,
  type MarkdownParseOptions,
  type ParsedDocument,
  type SourceDocument,
} from '#domains/document';
import { createFormatRegistry, type PluginModule } from '#domains/formats';
import { LineMarkdownParser } from '#domain-testing/document';
import { detects, fakeDocumentPlugin, type FileTree } from '#domain-testing/formats';
import { localeId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { err, ok } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createCheckTranslation } from './check-translation.ts';
import { createOpenProject } from './open-project.ts';

/** Lines as blocks (LineMarkdownParser), with each `[text](target)` a link. Records the options. */
class LinkParser extends LineMarkdownParser {
  readonly options: MarkdownParseOptions[] = [];
  override parse(text: string, options: MarkdownParseOptions): ParsedDocument {
    this.options.push(options);
    const document = super.parse(text, options);
    const preserved = [...text.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)].map((match) => ({
      kind: 'link' as const,
      range: { start: match.index, end: match.index + match[0].length },
      value: match[1] ?? '',
    }));
    return { ...document, preserved };
  }
}

async function openWith(
  tree: FileTree,
  plugin: PluginModule = fakeDocumentPlugin('format-fake', detects('likely')),
  settings: object = { targetLocale: 'he' },
) {
  const registry = createFormatRegistry([plugin], { apiVersion: 2 });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({
      '/p': { 'paperl10n.config.json': JSON.stringify(settings), ...tree },
    }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const parser = new LinkParser();
  return {
    check: createCheckTranslation({ sessions, parser }),
    parser,
    projectId: opened.value.projectId,
  };
}

/** The fake plugin, with its layout's link mapping replaced. */
function mapping(sourceLinkTarget: (target: string) => string): PluginModule {
  const base = fakeDocumentPlugin('format-fake').create({ apiVersion: 2 });
  if (base.kind !== 'document') throw new Error('test setup');
  return fakeDocumentPlugin('format-fake', {
    ...detects('likely'),
    open: async (context) => {
      const layout = await base.open(context);
      return layout.ok ? ok({ ...layout.value, sourceLinkTarget }) : layout;
    },
  });
}

/** A plugin whose single page, `page`, lives at `path`, with its translation at `he/<path>`. */
function pluginWithPageAt(path: string): PluginModule {
  return fakeDocumentPlugin('format-fake', {
    ...detects('likely'),
    open: () => {
      const key = documentKey('page');
      const sourcePath = projectPath(path);
      const targetPath = projectPath(`he/${path}`);
      const english = localeId('en');
      if (!key.ok || !sourcePath.ok || !targetPath.ok || !english.ok) throw new Error('test setup');
      const document: SourceDocument = {
        key: key.value,
        path: sourcePath.value,
        locale: english.value,
      };
      return Promise.resolve(
        ok({
          locales: [],
          listSourceDocuments: () => Promise.resolve(ok([document])),
          targetPathFor: () => ok(targetPath.value),
        }),
      );
    },
  });
}

const source = 'Intro [a](/a/)\n## One\n[b](/b/)\n';

describe('checkTranslation', () => {
  it('checks the text as written against the source on disk, by section and for the page', async () => {
    const { check, projectId } = await openWith({ 'en/index.md': source, 'he/index.md': 'old' });
    expect(
      await check(projectId, { key: 'index', text: 'מבוא [a](/a/)\n## אחד\n[b](/z/)\n' }),
    ).toEqual({
      ok: true,
      value: {
        page: [{ kind: 'link', missing: ['/b/'], extra: ['/z/'] }],
        sections: [[], [{ kind: 'link', missing: ['/b/'], extra: ['/z/'] }]],
        // This test parser marks no syntax, so all but whitespace counts.
        length: { source: 26, translation: 25 },
      },
    });
  });

  it('reads the translation’s links in the source’s form, through the plugin', async () => {
    const plugin = mapping((target) => target.replace(/^\/he\//, '/'));
    const { check, projectId } = await openWith({ 'en/index.md': source }, plugin);
    const checked = await check(projectId, {
      key: 'index',
      text: 'מבוא [a](/he/a/)\n## אחד\n[b](/he/b/)\n',
    });
    expect(checked.ok && checked.value.page).toEqual([]);
  });

  it('leaves links as written when the plugin’s mapping fails', async () => {
    const plugin = mapping(() => {
      throw new Error('boom');
    });
    const { check, projectId } = await openWith({ 'en/index.md': source }, plugin);
    const checked = await check(projectId, {
      key: 'index',
      text: 'מבוא [a](/a/)\n## אחד\n[b](/he/b/)\n',
    });
    expect(checked.ok && checked.value.page).toEqual([
      { kind: 'link', missing: ['/b/'], extra: ['/he/b/'] },
    ]);
  });

  it.each([
    ['plain Markdown for .md', 'docs/page.md', false],
    ['MDX for .mdx', 'docs/page.mdx', true],
  ])('parses both sides as the page’s files: %s', async (_description, path, mdx) => {
    const { check, parser, projectId } = await openWith({ [path]: source }, pluginWithPageAt(path));
    await check(projectId, { key: 'page', text: 'x' });
    expect(parser.options).toEqual([{ mdx }, { mdx }]);
  });

  it('reports an unknown project, a project without a target, and an unknown page', async () => {
    const { check, projectId } = await openWith({ 'en/index.md': source });
    expect(await check('nope', { key: 'index', text: '' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
    expect(await check(projectId, { key: 'missing', text: '' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-document', key: 'missing' },
    });
    const untargeted = await openWith({ 'en/index.md': source }, undefined, {});
    expect(await untargeted.check(untargeted.projectId, { key: 'index', text: '' })).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });

  it('reports an unreadable source', async () => {
    const { check, projectId } = await openWith({ 'en/index.md': new Uint8Array([0xff]) });
    expect(await check(projectId, { key: 'index', text: '' })).toEqual({
      ok: false,
      error: {
        code: 'workspace.document-unreadable',
        cause: { code: 'files.not-utf8', path: 'en/index.md' },
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
    expect(await listing.check(listing.projectId, { key: 'index', text: '' })).toEqual({
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
    expect(await target.check(target.projectId, { key: 'index', text: '' })).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no target', formatId: 'format-fake' },
    });
  });
});
