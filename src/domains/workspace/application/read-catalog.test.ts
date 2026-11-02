// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type CatalogFormat, type PluginModule } from '#domains/formats';
import { messageFingerprint } from '#domains/translation';
import {
  detects,
  fakeCatalogPlugin,
  fakeDocumentPlugin,
  type FileTree,
} from '#domain-testing/formats';
import { err } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createOpenProject } from './open-project.ts';
import { createReadCatalog } from './read-catalog.ts';

const STATUS = '.paperl10n/status/he.json';
const config = (settings: object = { targetLocale: 'he' }) =>
  JSON.stringify({ sourceLocale: 'en', ...settings });

const tree: FileTree = {
  'paperl10n.config.json': config(),
  'i18n/en.cat': 'a=Hello $1\nb=Bye\nc=See <b>$2</b>\n',
  'i18n/qqq.cat': 'a=A greeting. $1: a name\nc=\n',
  'i18n/he.cat': 'a=שלום $1\nc=ראו\ngone=ישן $1\n',
  [STATUS]: JSON.stringify({
    version: 2,
    pages: {},
    catalogs: { i18n: { a: messageFingerprint('Hello $1'), c: messageFingerprint('Old') } },
  }),
};

async function open(files: FileTree, plugins?: PluginModule[]) {
  const registry = createFormatRegistry(
    plugins ?? [fakeCatalogPlugin('catalog-fake', detects('likely'))],
    { apiVersion: 3 },
  );
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({ '/p': files }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const read = createReadCatalog({ sessions });
  const projectId = opened.value.projectId;
  return (key = 'i18n') => read(projectId, key);
}

const withPlugin = (overrides: Partial<CatalogFormat>) => [
  fakeCatalogPlugin('catalog-fake', { ...detects('likely'), ...overrides }),
];

describe('readCatalog', () => {
  it('reads each source message with its documentation, translation, status, and tokens', async () => {
    const result = await (await open(tree))();
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value).toEqual({
      key: 'i18n',
      sourcePath: 'i18n/en.cat',
      targetPath: 'i18n/he.cat',
      targetExists: true,
      documentationPath: 'i18n/qqq.cat',
      messages: [
        {
          key: 'a',
          source: 'Hello $1',
          documentation: 'A greeting. $1: a name',
          translation: 'שלום $1',
          status: 'translated',
          sourceTokens: [{ kind: 'parameter', text: '$1', start: 6, end: 8 }],
          translationTokens: [{ kind: 'parameter', text: '$1', start: 5, end: 7 }],
        },
        {
          key: 'b',
          source: 'Bye',
          documentation: null,
          translation: null,
          status: 'missing',
          sourceTokens: [],
          translationTokens: [],
        },
        {
          key: 'c',
          source: 'See <b>$2</b>',
          documentation: null,
          translation: 'ראו',
          status: 'outdated',
          sourceTokens: [
            { kind: 'tag', name: 'b', text: '<b>', start: 4, end: 7 },
            { kind: 'parameter', text: '$2', start: 7, end: 9 },
            { kind: 'tag', name: 'b', text: '</b>', start: 9, end: 13 },
          ],
          translationTokens: [],
        },
      ],
      notInSource: [
        {
          key: 'gone',
          text: 'ישן $1',
          tokens: [{ kind: 'parameter', text: '$1', start: 4, end: 6 }],
        },
      ],
      documentationProblem: null,
      statusFile: { exists: true, problem: null },
    });
  });

  it('reads a catalog without a translation or documentation file', async () => {
    const result = await (
      await open({ 'paperl10n.config.json': config(), 'i18n/en.cat': 'a=A\n' })
    )();
    expect(result.ok && result.value).toMatchObject({
      targetExists: false,
      documentationPath: null,
      messages: [{ key: 'a', translation: null, status: 'missing', documentation: null }],
      notInSource: [],
      statusFile: { exists: false, problem: null },
    });
  });

  it('reads the messages without documentation it can’t read, and says why', async () => {
    const result = await (await open({ ...tree, 'i18n/qqq.cat': 'not a message\n' }))();
    expect(result.ok && result.value.messages.map((m) => m.documentation)).toEqual([
      null,
      null,
      null,
    ]);
    expect(result.ok && result.value.documentationProblem).toMatchObject({
      code: 'formats.invalid-catalog',
      formatId: 'catalog-fake',
    });
  });

  it('reads a status file it can’t parse as empty, and says why', async () => {
    const result = await (await open({ ...tree, [STATUS]: 'nope' }))();
    expect(result.ok && result.value.messages.map((m) => m.status)).toEqual([
      'draft',
      'missing',
      'draft',
    ]);
    expect(result.ok && result.value.statusFile.problem?.code).toBe('workspace.status-invalid');
  });

  it('reads messages without tokens when the format’s scanner fails', async () => {
    const read = await open(
      tree,
      withPlugin({
        placeholders: {
          scan: () => {
            throw new Error('boom');
          },
        },
      }),
    );
    const result = await read();
    expect(result.ok && result.value.messages[0]?.sourceTokens).toEqual([]);
  });

  it.each<[string, FileTree, unknown]>([
    [
      'a source it can’t read',
      { ...tree, 'i18n/en.cat': new Uint8Array([0xff, 0xfe]) },
      {
        code: 'workspace.catalog-unreadable',
        cause: { code: 'files.not-utf8', path: 'i18n/en.cat' },
      },
    ],
    [
      'a translation its format can’t read',
      { ...tree, 'i18n/he.cat': 'not a message\n' },
      {
        code: 'formats.invalid-catalog',
        reason: 'not a message: not a message',
        formatId: 'catalog-fake',
      },
    ],
  ])('reports %s', async (_name, files, error) => {
    expect(await (await open(files))()).toEqual({ ok: false, error });
  });

  it('reports a catalog the project doesn’t have', async () => {
    expect(await (await open(tree))('nope')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: 'nope' },
    });
  });

  it('reports any catalog of a project without catalogs as unknown', async () => {
    const read = await open({ 'paperl10n.config.json': config(), 'en/index.md': '# Home\n' }, [
      fakeDocumentPlugin('format-fake', detects('likely')),
    ]);
    expect(await read()).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: 'i18n' },
    });
  });

  it('passes the layout’s errors through', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const listing = await open(
      tree,
      withPlugin({
        open: () =>
          Promise.resolve({
            ok: true,
            value: {
              locales: [],
              listCatalogs: () => Promise.resolve(err(failure)),
              targetPathFor: () => err(failure),
            },
          }),
      }),
    );
    expect(await listing()).toEqual({ ok: false, error: { ...failure, formatId: 'catalog-fake' } });

    const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
    if (plugin.kind !== 'catalog') throw new Error('test setup');
    const paths = await open(
      tree,
      withPlugin({
        open: async (context) => {
          const layout = await plugin.open(context);
          return layout.ok
            ? { ok: true, value: { ...layout.value, targetPathFor: () => err(failure) } }
            : layout;
        },
      }),
    );
    expect(await paths()).toEqual({ ok: false, error: { ...failure, formatId: 'catalog-fake' } });
  });

  it('reports an unknown project and a project without a target language', async () => {
    expect(
      await createReadCatalog({ sessions: new InMemoryProjectSessions(randomUUID) })('x', 'i18n'),
    ).toEqual({ ok: false, error: { code: 'workspace.unknown-project' } });
    const read = await open({ ...tree, 'paperl10n.config.json': config({}) });
    expect(await read()).toEqual({ ok: false, error: { code: 'workspace.no-target-locale' } });
  });
});
