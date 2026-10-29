// SPDX-License-Identifier: GPL-3.0-or-later
// The whole app below the transport: real registry, real use cases, the real format-stub plugin,
// and the real error mapping, over an in-memory copy of format-stub's "basic" fixture.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileTree } from '#domain-testing/formats';
import { FakeFolderPicker, FakeProjectFilesOpener } from '#domain-testing/workspace';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
import { InMemoryDraftStore } from '#adapters/workspace/in-memory-draft-store';
import { InMemoryProjectSessions } from '#adapters/workspace/in-memory-project-sessions';
import type { PaperLionApi } from '#ipc-contract';
import type { PluginModule } from '#domains/formats';
import { createAppApi } from './create-app-api.ts';
import { builtInPlugins } from './plugins.ts';

function readTree(root: string): FileTree {
  const tree: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else tree[relative(root, absolute).split(sep).join('/')] = readFileSync(absolute);
    }
  };
  walk(root);
  return tree;
}

const basic = readTree(new URL('../plugins/format-stub/fixtures/basic', import.meta.url).pathname);
const starlight = readTree(
  new URL('../plugins/format-starlight/fixtures/root-locale', import.meta.url).pathname,
);

function appWith(
  folders: Record<string, FileTree>,
  answer: string | null = '/projects/basic',
  plugins: readonly PluginModule[] = builtInPlugins,
): PaperLionApi {
  const api = createAppApi({
    folderPicker: new FakeFolderPicker(answer),
    opener: new FakeProjectFilesOpener(folders),
    drafts: new InMemoryDraftStore(),
    sessions: new InMemoryProjectSessions(randomUUID),
    parser: createLezerMarkdownParser(),
    plugins,
    onUnexpected: (method, thrown) => {
      throw new Error(`unexpected in ${method}: ${String(thrown)}`);
    },
  });
  if (!api.ok) throw new Error(`test setup: ${JSON.stringify(api.error)}`);
  return api.value;
}

/** What crosses IPC must survive structured cloning unchanged. */
function cloned<T>(value: T): T {
  const copy = structuredClone(value);
  expect(copy).toEqual(value);
  return copy;
}

describe('createAppApi (the walking skeleton below the transport)', () => {
  it('opens the basic fixture and lists its documents with target paths', async () => {
    const api = appWith({ '/projects/basic': basic });
    const opened = cloned(await api.openProject());
    expect(opened).toEqual({
      ok: true,
      value: {
        projectId: expect.any(String) as string,
        name: 'basic',
        sourceLocale: { id: 'en', direction: 'ltr' },
        targetLocale: { id: 'he', direction: 'rtl' },
        documentFormat: { id: 'format-stub', displayName: 'Folder per locale (stub)' },
        warnings: [],
      },
    });
    if (!opened.ok || opened.value === null) return;

    expect(cloned(await api.listSourceDocuments({ projectId: opened.value.projectId }))).toEqual({
      ok: true,
      value: [
        {
          key: 'guide/getting-started',
          sourcePath: 'en/guide/getting-started.md',
          targetPath: 'he/guide/getting-started.md',
          targetExists: false,
          hasDraft: false,
        },
        {
          key: 'index',
          sourcePath: 'en/index.md',
          targetPath: 'he/index.md',
          targetExists: true,
          hasDraft: false,
        },
      ],
    });
  });

  it('reads and parses a page with the real parser, and a missing translation as null', async () => {
    const api = appWith({ '/projects/basic': basic });
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error('test setup');
    const pair = cloned(
      await api.readDocumentPair({
        projectId: opened.value.projectId,
        key: 'guide/getting-started',
      }),
    );
    expect(pair).toEqual({
      ok: true,
      value: {
        key: 'guide/getting-started',
        source: {
          path: 'en/guide/getting-started.md',
          mdx: false,
          text: '# Getting started\n\nInstall, then run.\n',
          blocks: [
            { kind: 'heading', start: 0, end: 17, depth: 1 },
            { kind: 'paragraph', start: 19, end: 37 },
          ],
          inline: [{ kind: 'markup', start: 0, end: 1 }],
        },
        target: null,
        draft: null,
        // Not started yet: paired with a copy of the source, which a lone heading splits at.
        sections: {
          paired: true,
          pairs: [
            { kind: 'heading', source: { start: 0, end: 38 }, target: { start: 0, end: 38 } },
          ],
        },
      },
    });
  });

  it('opens a Starlight site, lists its pages with status, and reads MDX as MDX', async () => {
    const withoutPin = Object.fromEntries(
      Object.entries(starlight).filter(([path]) => path !== 'paperl10n.config.json'),
    );
    const api = appWith(
      {
        '/sites/lantern': {
          ...withoutPin,
          'paperl10n.config.json': JSON.stringify({ targetLocale: 'he' }),
        },
      },
      '/sites/lantern',
    );
    // No format pinned: detection picks Starlight ("certain") over format-stub's fallback.
    const opened = cloned(await api.openProject());
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    expect(opened.value.documentFormat).toEqual({
      id: 'format-starlight',
      displayName: 'Astro Starlight',
    });

    const listed = cloned(await api.listSourceDocuments({ projectId: opened.value.projectId }));
    expect(listed.ok && listed.value.map((d) => [d.key, d.targetExists])).toEqual([
      ['guides/getting-started', true],
      ['index', true],
      ['reference/api', false],
    ]);

    const pair = cloned(
      await api.readDocumentPair({ projectId: opened.value.projectId, key: 'index' }),
    );
    if (!pair.ok) throw new Error(JSON.stringify(pair));
    expect(pair.value.source.blocks.map((b) => b.kind)).toEqual(['frontmatter', 'mdx-esm', 'html']);
    expect(pair.value.target?.path).toBe('src/content/docs/he/index.mdx');
  });

  it('returns null when the user cancels', async () => {
    expect(cloned(await appWith({}, null).openProject())).toEqual({ ok: true, value: null });
  });

  it('returns error DTOs, not domain errors', async () => {
    const withoutConfig = Object.fromEntries(
      Object.entries(basic).filter(([path]) => path !== 'paperl10n.config.json'),
    );
    const api = appWith({ '/projects/basic': withoutConfig });
    expect(cloned(await api.openProject())).toEqual({
      ok: false,
      error: { code: 'workspace.config-missing', params: {}, details: [] },
    });
    expect(cloned(await api.listSourceDocuments({ projectId: 'nope' }))).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project', params: {}, details: [] },
    });
  });

  it('refuses to start with a broken plugin set', () => {
    const result = createAppApi({
      folderPicker: new FakeFolderPicker(null),
      opener: new FakeProjectFilesOpener({}),
      drafts: new InMemoryDraftStore(),
      sessions: new InMemoryProjectSessions(randomUUID),
      parser: createLezerMarkdownParser(),
      plugins: [...builtInPlugins, ...builtInPlugins],
      onUnexpected: () => undefined,
    });
    expect(result.ok ? 'ok' : result.error.code).toBe('formats.registry-invalid');
  });
});
