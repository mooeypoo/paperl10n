// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { messageKey, type Message } from '#domains/catalog';
import { createFormatRegistry, type CatalogFormat } from '#domains/formats';
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
import { catalogProgress, createListCatalogs } from './list-catalogs.ts';
import { createOpenProject } from './open-project.ts';

const STATUS = '.paperl10n/status/he.json';
const config = (settings: object = { targetLocale: 'he' }) =>
  JSON.stringify({ sourceLocale: 'en', ...settings });

const messagesTree: FileTree = {
  'paperl10n.config.json': config(),
  'i18n/en.cat': 'a=A\nb=B\nc=C\nd=D\n',
  'i18n/he.cat': 'a=א\nb=ב\nc=ג\ngone=old\n',
  'api/en.cat': 'x=X\n',
};

function status(records: Record<string, Record<string, string>>): string {
  return JSON.stringify({ version: 2, pages: {}, catalogs: records });
}

async function listWith(
  tree: FileTree,
  overrides: Partial<CatalogFormat> = {},
  withDocuments = false,
) {
  const plugins = [fakeCatalogPlugin('catalog-fake', { ...detects('likely'), ...overrides })];
  if (withDocuments) plugins.push(fakeDocumentPlugin('format-fake', detects('likely')));
  const registry = createFormatRegistry(plugins, { apiVersion: 3 });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({ '/p': tree }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  return createListCatalogs({ sessions })(opened.value.projectId);
}

describe('listCatalogs', () => {
  it("lists each catalog with its target file and progress, from the language's status file", async () => {
    const tree = {
      ...messagesTree,
      [STATUS]: status({
        i18n: { a: messageFingerprint('A'), b: messageFingerprint('Old B') },
      }),
    };
    expect(await listWith(tree)).toEqual({
      ok: true,
      value: {
        catalogs: [
          {
            key: 'api',
            sourcePath: 'api/en.cat',
            targetPath: 'api/he.cat',
            targetExists: false,
            progress: {
              total: 1,
              byStatus: { missing: 1, draft: 0, translated: 0, outdated: 0 },
              notInSource: 0,
            },
            problem: null,
          },
          {
            key: 'i18n',
            sourcePath: 'i18n/en.cat',
            targetPath: 'i18n/he.cat',
            targetExists: true,
            progress: {
              total: 4,
              byStatus: { missing: 1, draft: 1, translated: 1, outdated: 1 },
              notInSource: 1,
            },
            problem: null,
          },
        ],
        statusFile: { exists: true, problem: null },
      },
    });
  });

  it('lists nothing for a project without catalogs', async () => {
    const tree = { 'paperl10n.config.json': config(), 'en/index.md': '# Home\n' };
    const registry = createFormatRegistry([fakeDocumentPlugin('format-fake', detects('likely'))], {
      apiVersion: 3,
    });
    if (!registry.ok) throw new Error('test setup');
    const sessions = new InMemoryProjectSessions(randomUUID);
    const opened = await createOpenProject({
      folderPicker: new FakeFolderPicker('/p'),
      opener: new FakeProjectFilesOpener({ '/p': tree }),
      registry: registry.value,
      sessions,
    })();
    if (!opened.ok || opened.value === null) throw new Error('test setup');
    expect(await createListCatalogs({ sessions })(opened.value.projectId)).toEqual({
      ok: true,
      value: { catalogs: [], statusFile: { exists: false, problem: null } },
    });
  });

  it('lists catalogs of a project that has pages too', async () => {
    const result = await listWith({ ...messagesTree, 'en/index.md': '# Home\n' }, {}, true);
    expect(result.ok && result.value.catalogs.map((c) => c.key)).toEqual(['api', 'i18n']);
  });

  it('reads a status file it can’t parse as empty, and says why', async () => {
    const result = await listWith({ ...messagesTree, [STATUS]: 'nope' });
    expect(result.ok && result.value.statusFile.problem?.code).toBe('workspace.status-invalid');
    expect(result.ok && result.value.catalogs[1]?.progress?.byStatus).toEqual({
      missing: 1,
      draft: 3,
      translated: 0,
      outdated: 0,
    });
  });

  it('still lists a catalog whose source can’t be read, with the problem', async () => {
    const tree = { ...messagesTree, 'api/en.cat': new Uint8Array([0xff, 0xfe]) };
    const result = await listWith(tree);
    expect(result.ok && result.value.catalogs[0]).toEqual({
      key: 'api',
      sourcePath: 'api/en.cat',
      targetPath: 'api/he.cat',
      targetExists: false,
      progress: null,
      problem: {
        code: 'workspace.catalog-unreadable',
        cause: { code: 'files.not-utf8', path: 'api/en.cat' },
      },
    });
    expect(result.ok && result.value.catalogs[1]?.problem).toBeNull();
  });

  it('still lists a catalog whose translation its format can’t read, with the problem', async () => {
    const tree = { ...messagesTree, 'i18n/he.cat': 'not a message line\n' };
    const result = await listWith(tree);
    expect(result.ok && result.value.catalogs[1]).toMatchObject({
      key: 'i18n',
      progress: null,
      problem: { code: 'formats.invalid-catalog', formatId: 'catalog-fake' },
    });
  });

  it('passes a listing error from the format through', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const result = await listWith(messagesTree, {
      open: () =>
        Promise.resolve({
          ok: true,
          value: {
            locales: [],
            listCatalogs: () => Promise.resolve(err(failure)),
            targetPathFor: () => err(failure),
          },
        }),
    });
    expect(result).toEqual({ ok: false, error: { ...failure, formatId: 'catalog-fake' } });
  });

  it('passes a path error from the format through', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'no path' };
    const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
    if (plugin.kind !== 'catalog') throw new Error('test setup');
    const result = await listWith(messagesTree, {
      open: async (context) => {
        const layout = await plugin.open(context);
        return layout.ok
          ? { ok: true, value: { ...layout.value, targetPathFor: () => err(failure) } }
          : layout;
      },
    });
    expect(result).toEqual({ ok: false, error: { ...failure, formatId: 'catalog-fake' } });
  });

  it('reports an unknown project and a project without a target language', async () => {
    const sessions = new InMemoryProjectSessions(randomUUID);
    expect(await createListCatalogs({ sessions })('nope')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
    const result = await listWith({ ...messagesTree, 'paperl10n.config.json': config({}) });
    expect(result).toEqual({ ok: false, error: { code: 'workspace.no-target-locale' } });
  });
});

describe('catalogProgress', () => {
  const messages = (entries: Record<string, string>): Message[] =>
    Object.entries(entries).map(([raw, text]) => {
      const key = messageKey(raw);
      if (!key.ok) throw new Error('test setup');
      return { key: key.value, text };
    });

  it('counts each source message once, by status, and the extra keys apart', () => {
    expect(
      catalogProgress(
        messages({ a: 'A', b: 'B', c: 'C' }),
        messages({ a: 'א', c: '', z: 'Z' }),
        new Map([['a', messageFingerprint('A')]]),
      ),
    ).toEqual({
      total: 3,
      byStatus: { missing: 2, draft: 0, translated: 1, outdated: 0 },
      notInSource: 1,
    });
  });

  it('counts a catalog without a translation as all missing', () => {
    expect(catalogProgress(messages({ a: 'A' }), null, undefined)).toEqual({
      total: 1,
      byStatus: { missing: 1, draft: 0, translated: 0, outdated: 0 },
      notInSource: 0,
    });
  });
});
