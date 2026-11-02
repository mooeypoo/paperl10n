// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type CatalogFormat, type PluginModule } from '#domains/formats';
import {
  detects,
  fakeCatalogPlugin,
  fakeDocumentPlugin,
  type FileTree,
} from '#domain-testing/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err } from '#kernel/result';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createCheckMessage } from './check-message.ts';
import { createOpenProject } from './open-project.ts';

const SOURCE = 'i18n/en.cat' as ProjectPath;
const untranslated: FileTree = {
  'paperl10n.config.json': JSON.stringify({ sourceLocale: 'en', targetLocale: 'he' }),
  [SOURCE]: 'a=Hello $1\nb=See <b>$2</b> {{PLURAL:$2|one|many}}\n',
};
const tree: FileTree = { ...untranslated, 'i18n/he.cat': 'a=שלום\n' };

async function open(files: FileTree, plugins?: PluginModule[]) {
  const registry = createFormatRegistry(
    plugins ?? [fakeCatalogPlugin('catalog-fake', detects('likely'))],
    { apiVersion: 3 },
  );
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opener = new FakeProjectFilesOpener({ '/p': files });
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener,
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const check = createCheckMessage({ sessions });
  const projectId = opened.value.projectId;
  const disk = opener.opened.get('/p');
  if (disk === undefined) throw new Error('test setup');
  return Object.assign(
    (key: string, text: string, catalog = 'i18n') => check(projectId, { catalog, key, text }),
    { disk },
  );
}

const withPlugin = (overrides: Partial<CatalogFormat>) => [
  fakeCatalogPlugin('catalog-fake', { ...detects('likely'), ...overrides }),
];

describe('checkMessage', () => {
  it('returns the text’s tokens and what it lost or gained against the source message', async () => {
    const check = await open(tree);
    // Not the translation on disk ("שלום"): the text as it's being written.
    expect(await check('a', 'שלום $2 [[Help:X]]')).toEqual({
      ok: true,
      value: {
        tokens: [
          { kind: 'parameter', text: '$2', start: 5, end: 7 },
          { kind: 'link', target: 'Help:X', text: '[[Help:X]]', start: 8, end: 18 },
        ],
        warnings: [
          { kind: 'missing', token: 'parameter', value: '$1' },
          { kind: 'unexpected', token: 'parameter', value: '$2' },
          { kind: 'unexpected', token: 'link', value: 'Help:X' },
        ],
      },
    });
  });

  it('finds nothing to warn about in a translation that keeps what the source has', async () => {
    const check = await open(tree);
    const result = await check('b', 'ראו <b>$2</b> {{PLURAL:$2|אחד|הרבה}}');
    expect(result.ok && result.value.warnings).toEqual([]);
    expect(result.ok && result.value.tokens.map((token) => token.kind)).toEqual([
      'tag',
      'parameter',
      'tag',
      'plural',
      'parameter',
    ]);
  });

  it('checks a message of a catalog without a translation file, and an empty text', async () => {
    const check = await open(untranslated);
    expect(await check('a', '')).toEqual({ ok: true, value: { tokens: [], warnings: [] } });
    const result = await check('a', 'שלום {{');
    expect(result.ok && result.value.warnings).toEqual([
      { kind: 'missing', token: 'parameter', value: '$1' },
      { kind: 'unbalanced', brackets: '{}' },
    ]);
  });

  it('checks without tokens when the format’s scanner fails', async () => {
    const check = await open(
      tree,
      withPlugin({
        placeholders: {
          scan: () => {
            throw new Error('boom');
          },
        },
      }),
    );
    expect(await check('a', 'שלום $1')).toEqual({ ok: true, value: { tokens: [], warnings: [] } });
  });

  it.each<[string, FileTree, string, string, unknown]>([
    [
      'a key the source doesn’t have',
      tree,
      'i18n',
      'gone',
      { code: 'workspace.unknown-message', catalog: 'i18n', key: 'gone' },
    ],
    [
      'a catalog the project doesn’t have',
      tree,
      'nope',
      'a',
      { code: 'workspace.unknown-catalog', key: 'nope' },
    ],
    [
      'a source it can’t read',
      { ...tree, 'i18n/en.cat': new Uint8Array([0xff, 0xfe]) },
      'i18n',
      'a',
      {
        code: 'workspace.catalog-unreadable',
        cause: { code: 'files.not-utf8', path: 'i18n/en.cat' },
      },
    ],
  ])('reports %s', async (_name, files, catalog, key, error) => {
    const check = await open(files);
    expect(await check(key, 'x', catalog)).toEqual({ ok: false, error });
  });

  it('checks against the source on disk now, and reports one its format can’t read', async () => {
    const check = await open(tree);
    await check.disk.writeText(SOURCE, 'a=Hello $3\n');
    // Against the source when the project opened ("Hello $1"), `$3` would be two warnings.
    expect(await check('a', 'שלום $3')).toEqual({
      ok: true,
      value: { tokens: [{ kind: 'parameter', text: '$3', start: 5, end: 7 }], warnings: [] },
    });
    await check.disk.writeText(SOURCE, 'not a message\n');
    expect(await check('a', 'x')).toEqual({
      ok: false,
      error: {
        code: 'formats.invalid-catalog',
        reason: 'not a message: not a message',
        formatId: 'catalog-fake',
      },
    });
  });

  it('reports any catalog of a project without catalogs as unknown', async () => {
    const check = await open(
      {
        'paperl10n.config.json': JSON.stringify({ sourceLocale: 'en', targetLocale: 'he' }),
        'en/index.md': '# Home\n',
      },
      [fakeDocumentPlugin('format-fake', detects('likely'))],
    );
    expect(await check('a', 'x')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: 'i18n' },
    });
  });

  it('passes the layout’s errors through', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const check = await open(
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
    expect(await check('a', 'x')).toEqual({
      ok: false,
      error: { ...failure, formatId: 'catalog-fake' },
    });
  });

  it('reports an unknown project', async () => {
    const check = createCheckMessage({ sessions: new InMemoryProjectSessions(randomUUID) });
    expect(await check('x', { catalog: 'i18n', key: 'a', text: '' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});
