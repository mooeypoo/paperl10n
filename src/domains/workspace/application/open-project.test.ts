// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type FormatRegistry, type ProjectFiles } from '#domains/formats';
import { detects, fakeDocumentPlugin, fakeManifest, type FileTree } from '#domain-testing/formats';
import { err } from '#kernel/result';
import type { PluginModule } from '#domains/formats';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import type { ProjectFilesOpener } from './ports/project-files-opener.ts';
import { createOpenProject } from './open-project.ts';

const config = (value: unknown) => JSON.stringify(value);
const project: FileTree = {
  'paperl10n.config.json': config({ sourceLocale: 'en', targetLocale: 'he' }),
  'en/index.md': '# Home\n',
  'en/guide/intro.md': '# Intro\n',
};

// A minimal catalog plugin, to check that a pinned id must name a *document* format.
const unused = err({ code: 'formats.unsupported-project' as const, reason: 'unused' });
const catalogBanana: PluginModule = {
  manifest: fakeManifest('catalog-banana'),
  create: () => ({
    kind: 'catalog',
    detect: () => Promise.resolve({ matches: false }),
    open: () => Promise.resolve(unused),
    parse: () => unused,
    serialize: () => unused,
    placeholders: { scan: () => [] },
  }),
};

function registryOf(plugins: PluginModule[]): FormatRegistry {
  const registry = createFormatRegistry(plugins, { apiVersion: 2 });
  if (!registry.ok) throw new Error(`test setup: ${JSON.stringify(registry.error)}`);
  return registry.value;
}

function setup(
  options: {
    tree?: FileTree;
    plugins?: PluginModule[];
    folder?: string | null;
    opener?: ProjectFilesOpener;
  } = {},
) {
  const folder = options.folder === undefined ? '/home/me/my-docs' : options.folder;
  const sessions = new InMemoryProjectSessions(randomUUID);
  const openProject = createOpenProject({
    folderPicker: new FakeFolderPicker(folder),
    opener:
      options.opener ?? new FakeProjectFilesOpener({ '/home/me/my-docs': options.tree ?? project }),
    registry: registryOf(options.plugins ?? [fakeDocumentPlugin('format-fake', detects('likely'))]),
    sessions,
  });
  return { openProject, sessions };
}

describe('openProject', () => {
  it('opens the project, stores it in a session, and returns a summary', async () => {
    const { openProject, sessions } = setup();
    const result = await openProject();
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;

    expect(result.value).toEqual({
      projectId: expect.any(String) as string,
      name: 'my-docs',
      sourceLocale: { id: 'en', direction: 'ltr' },
      targetLocale: { id: 'he', direction: 'rtl' },
      documentFormat: { id: 'format-fake', displayName: 'Fake format-fake' },
      warnings: [],
    });
    const stored = sessions.get(result.value.projectId);
    expect(stored?.name).toBe('my-docs');
    expect(stored?.config.targetLocale).toBe('he');
    expect(stored?.documentFormat.manifest.id).toBe('format-fake');
  });

  it('returns null and stores nothing when the user cancels', async () => {
    const { openProject, sessions } = setup({ folder: null });
    expect(await openProject()).toEqual({ ok: true, value: null });
    expect(sessions.get('anything')).toBeUndefined();
  });

  it.each<[string, Record<string, unknown>, { id: string; direction: string }]>([
    ['the catalog', { targetLocale: 'ydd' }, { id: 'ydd', direction: 'rtl' }],
    [
      "the config's override of a known language",
      { targetLocale: 'rhg', languages: { rhg: { dir: 'ltr' } } },
      { id: 'rhg', direction: 'ltr' },
    ],
    [
      "the config's own language",
      {
        targetLocale: 'art-x-lantern',
        languages: { 'art-x-lantern': { name: 'Lanternese', dir: 'rtl' } },
      },
      { id: 'art-x-lantern', direction: 'rtl' },
    ],
  ])("takes each side's direction from %s", async (_description, settings, expected) => {
    const { openProject } = setup({
      tree: { ...project, 'paperl10n.config.json': config(settings) },
    });
    const result = await openProject();
    expect(result.ok && result.value?.targetLocale).toEqual(expected);
  });

  it('opens a project without a target language, so the user can choose one', async () => {
    const { openProject, sessions } = setup({
      tree: { ...project, 'paperl10n.config.json': config({}) },
    });
    const result = await openProject();
    expect(result.ok && result.value?.targetLocale).toBeNull();
    if (!result.ok || result.value === null) return;
    expect(sessions.get(result.value.projectId)?.targetLocale).toBeNull();
  });

  it("adds the project's own languages to its catalog: config entries and unknown locale folders", async () => {
    const { openProject, sessions } = setup({
      tree: {
        ...project,
        'paperl10n.config.json': config({
          targetLocale: 'he',
          languages: { 'art-x-lantern': { name: 'Lanternese', dir: 'rtl' } },
        }),
      },
      plugins: [
        fakeDocumentPlugin('format-fake', detects('likely'), [
          'he',
          'art-x-lantern',
          'qaa-x-folder',
        ]),
      ],
    });
    const result = await openProject();
    if (!result.ok || result.value === null) throw new Error('expected a project');
    const catalog = sessions.get(result.value.projectId)?.catalog;
    expect(catalog?.find('art-x-lantern')).toMatchObject({ name: 'Lanternese', direction: 'rtl' });
    expect(catalog?.find('qaa-x-folder')).toMatchObject({ name: 'qaa-x-folder', custom: true });
    expect(catalog?.find('he')?.custom).toBe(false);
  });

  it('passes config warnings through', async () => {
    const { openProject } = setup({
      tree: { ...project, 'paperl10n.config.json': config({ targetLocale: 'he', colour: 'red' }) },
    });
    const result = await openProject();
    expect(result.ok && result.value?.warnings).toEqual(['unknown key "colour" is ignored']);
  });

  describe('choosing the document format', () => {
    it('uses the format pinned in the config, even if another detects better', async () => {
      const { openProject } = setup({
        tree: {
          ...project,
          'paperl10n.config.json': config({ targetLocale: 'he', documentFormat: 'format-pinned' }),
        },
        plugins: [
          fakeDocumentPlugin('format-pinned'),
          fakeDocumentPlugin('format-certain', detects('certain')),
        ],
      });
      const result = await openProject();
      expect(result.ok && result.value?.documentFormat.id).toBe('format-pinned');
    });

    it('otherwise uses the best-ranked detection', async () => {
      const { openProject } = setup({
        plugins: [
          fakeDocumentPlugin('format-fallback', detects('fallback')),
          fakeDocumentPlugin('format-certain', detects('certain')),
          fakeDocumentPlugin('format-none'),
        ],
      });
      const result = await openProject();
      expect(result.ok && result.value?.documentFormat.id).toBe('format-certain');
    });

    it('passes the format its own options from the config', async () => {
      let received: unknown;
      const { openProject } = setup({
        tree: {
          ...project,
          'paperl10n.config.json': config({
            targetLocale: 'he',
            formatOptions: { 'format-fake': { root: 'docs' }, 'format-other': { x: 1 } },
          }),
        },
        plugins: [
          fakeDocumentPlugin('format-fake', {
            ...detects('likely'),
            open: (context) => {
              received = context.options;
              return Promise.resolve(
                err({ code: 'formats.unsupported-project', reason: 'stop here' }),
              );
            },
          }),
        ],
      });
      await openProject();
      expect(received).toEqual({ root: 'docs' });
    });
  });

  describe('errors', () => {
    it.each<[string, Parameters<typeof setup>[0], unknown]>([
      [
        'a folder that cannot be opened',
        { folder: '/nowhere' },
        { code: 'workspace.folder-unavailable', reason: 'not-found' },
      ],
      [
        'a project without a config file',
        { tree: { 'en/index.md': '' } },
        { code: 'workspace.config-missing' },
      ],
      [
        'a config file that is not UTF-8',
        { tree: { ...project, 'paperl10n.config.json': new Uint8Array([0xff, 0xfe, 0x00]) } },
        {
          code: 'workspace.config-unreadable',
          cause: { code: 'files.not-utf8', path: 'paperl10n.config.json' },
        },
      ],
      [
        'an invalid config',
        { tree: { ...project, 'paperl10n.config.json': config({ targetLocale: 'pt_BR' }) } },
        {
          code: 'workspace.config-invalid',
          problems: [{ field: 'targetLocale', problem: '"pt_BR" isn\'t a valid locale id' }],
        },
      ],
      [
        'a pinned format that is not installed',
        {
          tree: {
            ...project,
            'paperl10n.config.json': config({ targetLocale: 'he', documentFormat: 'format-nope' }),
          },
        },
        { code: 'workspace.unknown-document-format', formatId: 'format-nope' },
      ],
      [
        'a pinned format that is a catalog format',
        {
          tree: {
            ...project,
            'paperl10n.config.json': config({
              targetLocale: 'he',
              documentFormat: 'catalog-banana',
            }),
          },
          plugins: [catalogBanana],
        },
        { code: 'workspace.unknown-document-format', formatId: 'catalog-banana' },
      ],
      [
        'no format recognizing the project',
        { plugins: [fakeDocumentPlugin('format-none')] },
        { code: 'workspace.no-document-format', failures: [] },
      ],
      [
        'the chosen format failing to open the project',
        {
          plugins: [
            fakeDocumentPlugin('format-fake', {
              ...detects('likely'),
              open: () =>
                Promise.resolve(err({ code: 'formats.invalid-options', reason: 'bad root' })),
            }),
          ],
        },
        { code: 'formats.invalid-options', reason: 'bad root', formatId: 'format-fake' },
      ],
    ])('reports %s', async (_description, options, error) => {
      const { openProject } = setup(options);
      expect(await openProject()).toEqual({ ok: false, error });
    });

    it('includes detection failures when no format recognizes the project', async () => {
      const { openProject } = setup({
        plugins: [
          fakeDocumentPlugin('format-broken', { detect: () => Promise.reject(new Error('boom')) }),
        ],
      });
      expect(await openProject()).toEqual({
        ok: false,
        error: {
          code: 'workspace.no-document-format',
          failures: [{ code: 'formats.plugin-failed', formatId: 'format-broken', reason: 'boom' }],
        },
      });
    });

    it('reports an unreadable config file distinctly from a missing one', async () => {
      const unreadable: ProjectFilesOpener = {
        open: () =>
          Promise.resolve({
            ok: true,
            value: {
              name: 'x',
              files: {
                list: (dir) =>
                  Promise.resolve({ ok: false, error: { code: 'files.unreadable', path: dir } }),
                readText: (path) =>
                  Promise.resolve({ ok: false, error: { code: 'files.unreadable', path } }),
                exists: () => Promise.resolve(true),
              } satisfies ProjectFiles,
              writer: {
                writeText: (path) => Promise.resolve(err({ code: 'files.unwritable', path })),
              },
            },
          }),
      };
      const { openProject } = setup({ opener: unreadable });
      expect(await openProject()).toEqual({
        ok: false,
        error: {
          code: 'workspace.config-unreadable',
          cause: { code: 'files.unreadable', path: 'paperl10n.config.json' },
        },
      });
    });
  });
});
