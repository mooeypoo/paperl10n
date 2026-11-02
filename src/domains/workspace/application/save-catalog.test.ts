// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type CatalogFormat } from '#domains/formats';
import { messageFingerprint } from '#domains/translation';
import { detects, fakeCatalogPlugin, type FileTree } from '#domain-testing/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err } from '#kernel/result';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createKeepMessagesUpToDate } from './keep-messages-up-to-date.ts';
import { createOpenProject } from './open-project.ts';
import { createSaveCatalog, type MessageSave } from './save-catalog.ts';
import { createStatusUpdates } from './translation-status.ts';

const STATUS = '.paperl10n/status/he.json' as ProjectPath;
const TARGET = 'i18n/he.cat' as ProjectPath;
const config = (settings: object = { targetLocale: 'he' }) =>
  JSON.stringify({ sourceLocale: 'en', ...settings });
const status = (records: Record<string, string>) =>
  JSON.stringify({ version: 2, pages: {}, catalogs: { i18n: records } });

const untranslated: FileTree = {
  'paperl10n.config.json': config(),
  'i18n/en.cat': 'a=Hello\nb=Bye\nc=See you\n',
};
const tree: FileTree = {
  ...untranslated,
  [TARGET]: 'a=שלום\nc=להתראות\ngone=ישן\n',
  [STATUS]: status({ c: messageFingerprint('An older source') }),
};

async function open(files: FileTree, overrides: Partial<CatalogFormat> = {}) {
  const registry = createFormatRegistry(
    [fakeCatalogPlugin('catalog-fake', { ...detects('likely'), ...overrides })],
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
  const disk = opener.opened.get('/p');
  if (disk === undefined) throw new Error('test setup');
  const updates = createStatusUpdates();
  const projectId = opened.value.projectId;
  const catalogDrafts = new InMemoryDraftStore();
  const save = createSaveCatalog({ sessions, catalogDrafts, updates });
  const keep = createKeepMessagesUpToDate({ sessions, updates });
  const text = async (path: ProjectPath) => {
    const read = await disk.readText(path);
    return read.ok ? read.value : null;
  };
  return {
    projectId,
    sessions,
    disk,
    text,
    save: (messages: MessageSave[], catalog = 'i18n') => save(projectId, { catalog, messages }),
    keep: (messages: { key: string; source: string }[], catalog = 'i18n') =>
      keep(projectId, { catalog, messages }),
    /** The catalog's record in the status file, as written. */
    record: async () => {
      const written = await text(STATUS);
      return written === null
        ? null
        : (JSON.parse(written) as { catalogs?: Record<string, unknown> }).catalogs?.i18n;
    },
  };
}

const message = (key: string, text: string, base: string | null, source: string | null) => ({
  key,
  text,
  base,
  source,
});

describe('saveCatalog', () => {
  it('patches only the saved messages, and records them as up to date', async () => {
    const app = await open(tree);
    const result = await app.save([
      message('b', 'ביי', null, 'Bye'),
      message('c', 'נתראה', 'להתראות', 'See you'),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        path: 'i18n/he.cat',
        written: true,
        messages: [
          { key: 'b', status: 'translated' },
          { key: 'c', status: 'translated' },
        ],
        statusProblem: null,
      },
    });
    // `b` after `a` (source order); the message the source no longer has kept.
    expect(await app.text(TARGET)).toBe('a=שלום\nb=ביי\nc=נתראה\ngone=ישן\n');
    expect(await app.record()).toEqual({
      b: messageFingerprint('Bye'),
      c: messageFingerprint('See you'),
    });
  });

  it('writes a new translation file shaped like the source', async () => {
    const app = await open(untranslated);
    const result = await app.save([
      message('c', 'נתראה', null, 'See you'),
      message('a', 'שלום', null, 'Hello'),
    ]);
    expect(result.ok && result.value.written).toBe(true);
    expect(await app.text(TARGET)).toBe('a=שלום\nc=נתראה\n');
  });

  it('writes nothing for text the file already has, and still records it', async () => {
    const app = await open(tree);
    // An existing translation, saved as it is: a draft becomes up to date.
    expect(await app.save([message('a', 'שלום', 'שלום', 'Hello')])).toEqual({
      ok: true,
      value: {
        path: 'i18n/he.cat',
        written: false,
        messages: [{ key: 'a', status: 'translated' }],
        statusProblem: null,
      },
    });
    expect(await app.text(TARGET)).toBe(tree[TARGET]);
    expect(await app.record()).toMatchObject({ a: messageFingerprint('Hello') });
    // Saved as it is again: the record is the same, and the status file isn't rewritten.
    await app.disk.writeText(STATUS, `${(await app.text(STATUS)) ?? ''} `);
    const before = await app.text(STATUS);
    await app.save([message('a', 'שלום', 'שלום', 'Hello')]);
    expect(await app.text(STATUS)).toBe(before);
  });

  it('removes an emptied message and its record, and creates no file for removals only', async () => {
    const app = await open({ ...tree, [STATUS]: status({ a: messageFingerprint('Hello') }) });
    const result = await app.save([
      message('a', '', 'שלום', 'Hello'),
      message('gone', '', 'ישן', null),
    ]);
    expect(result.ok && result.value.messages).toEqual([
      { key: 'a', status: 'missing' },
      { key: 'gone', status: null },
    ]);
    expect(await app.text(TARGET)).toBe('c=להתראות\n');
    // No record left: the status file has no catalogs section.
    expect(await app.record()).toBeUndefined();

    // Nothing to remove, and no record to drop: no translation file, and no status file either.
    const empty = await open(untranslated);
    const removed = await empty.save([message('a', '', null, 'Hello')]);
    expect(removed.ok && removed.value.written).toBe(false);
    expect(await empty.text(TARGET)).toBeNull();
    expect(await empty.text(STATUS)).toBeNull();
  });

  it('reads an empty translation in the file as none', async () => {
    const app = await open({ ...tree, [TARGET]: 'a=שלום\nb=\n' });
    const result = await app.save([message('b', 'ביי', null, 'Bye')]);
    expect(result.ok && result.value.messages).toEqual([{ key: 'b', status: 'translated' }]);
    expect(await app.text(TARGET)).toBe('a=שלום\nb=ביי\n');
  });

  it('creates the translation’s folder when its layout puts it in a new one', async () => {
    const app = await open(untranslated, {
      open: async (context) => {
        const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
        if (plugin.kind !== 'catalog') throw new Error('test setup');
        const layout = await plugin.open(context);
        const elsewhere = 'he/i18n/messages.cat' as ProjectPath;
        return layout.ok
          ? {
              ok: true,
              value: { ...layout.value, targetPathFor: () => ({ ok: true, value: elsewhere }) },
            }
          : layout;
      },
    });
    const result = await app.save([message('a', 'שלום', null, 'Hello')]);
    expect(result.ok && result.value.path).toBe('he/i18n/messages.cat');
    expect(await app.text('he/i18n/messages.cat' as ProjectPath)).toBe('a=שלום\n');
  });

  it('saves a translation whose source changed since, without recording it', async () => {
    const app = await open(tree);
    // The translator saw "See you later"; the source says "See you" now. `c`'s old record stays.
    const result = await app.save([message('c', 'נתראה אחר כך', 'להתראות', 'See you later')]);
    expect(result.ok && result.value.messages).toEqual([{ key: 'c', status: 'outdated' }]);
    expect(await app.text(TARGET)).toBe('a=שלום\nc=נתראה אחר כך\ngone=ישן\n');
    expect(await app.record()).toEqual({ c: messageFingerprint('An older source') });
  });

  it('saves a message the source doesn’t have, without a status or a record', async () => {
    const app = await open(tree);
    const result = await app.save([message('gone', 'חדש', 'ישן', null)]);
    expect(result.ok && result.value.messages).toEqual([{ key: 'gone', status: null }]);
    expect(await app.text(TARGET)).toBe('a=שלום\nc=להתראות\ngone=חדש\n');
    expect(await app.record()).toEqual({ c: messageFingerprint('An older source') });
  });

  it('refuses, writing nothing, when saved messages changed on disk since editing started', async () => {
    const app = await open(tree);
    // `a` changed on disk; `b` was added there. Changes elsewhere in the file don't matter.
    await app.disk.writeText(TARGET, 'a=היי\nb=ביי\nc=להתראות\nz=אחר\n');
    expect(
      await app.save([
        message('a', 'שלום רב', 'שלום', 'Hello'),
        message('b', 'להת', null, 'Bye'),
        message('c', 'נתראה', 'להתראות', 'See you'),
      ]),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.catalog-changed', path: 'i18n/he.cat', keys: ['a', 'b'] },
    });
    expect(await app.text(TARGET)).toBe('a=היי\nb=ביי\nc=להתראות\nz=אחר\n');
    // Only `c` is saved: the rest of the file, changed on disk, is kept.
    const saved = await app.save([message('c', 'נתראה', 'להתראות', 'See you')]);
    expect(saved.ok).toBe(true);
    expect(await app.text(TARGET)).toBe('a=היי\nb=ביי\nc=נתראה\nz=אחר\n');
  });

  it('saves the translation even when the status file can’t be read, and says why', async () => {
    const app = await open({ ...tree, [STATUS]: 'not json' });
    const result = await app.save([message('b', 'ביי', null, 'Bye')]);
    expect(result).toEqual({
      ok: true,
      value: {
        path: 'i18n/he.cat',
        written: true,
        messages: [{ key: 'b', status: 'draft' }],
        statusProblem: {
          code: 'workspace.status-invalid',
          path: STATUS,
          problem: expect.any(String) as string,
        },
      },
    });
    expect(await app.text(STATUS)).toBe('not json');
  });

  it('saves the translation even when the status file can’t be written, and says why', async () => {
    const app = await open({ ...untranslated, '.paperl10n': 'not a folder' });
    const result = await app.save([message('b', 'ביי', null, 'Bye')]);
    expect(result.ok && result.value.statusProblem).toEqual({
      code: 'workspace.status-unwritable',
      cause: { code: 'files.not-a-directory', path: STATUS },
    });
    expect(await app.text(TARGET)).toBe('b=ביי\n');
  });

  it('reports a translation file it can’t write', async () => {
    const app = await open(tree);
    const project = app.sessions.get(app.projectId);
    if (project === undefined) throw new Error('test setup');
    app.sessions.update(app.projectId, {
      ...project,
      writer: { writeText: (path) => Promise.resolve(err({ code: 'files.unwritable', path })) },
    });
    expect(await app.save([message('b', 'ביי', null, 'Bye')])).toEqual({
      ok: false,
      error: {
        code: 'workspace.catalog-unwritable',
        cause: { code: 'files.unwritable', path: 'i18n/he.cat' },
      },
    });
  });

  it.each<[string, FileTree, MessageSave[], string, unknown]>([
    [
      'an empty message key',
      tree,
      [message('', 'x', null, null)],
      'i18n',
      { code: 'workspace.unknown-message', catalog: 'i18n', key: '' },
    ],
    [
      'a catalog the project doesn’t have',
      tree,
      [message('a', 'x', 'שלום', 'Hello')],
      'nope',
      { code: 'workspace.unknown-catalog', key: 'nope' },
    ],
    [
      'a source it can’t read',
      { ...tree, 'i18n/en.cat': new Uint8Array([0xff, 0xfe]) },
      [message('a', 'x', 'שלום', 'Hello')],
      'i18n',
      {
        code: 'workspace.catalog-unreadable',
        cause: { code: 'files.not-utf8', path: 'i18n/en.cat' },
      },
    ],
    [
      'a translation its format can’t read',
      { ...tree, [TARGET]: 'not a message\n' },
      [message('a', 'x', 'שלום', 'Hello')],
      'i18n',
      {
        code: 'formats.invalid-catalog',
        reason: 'not a message: not a message',
        formatId: 'catalog-fake',
      },
    ],
    [
      'no target language',
      { ...tree, 'paperl10n.config.json': config({}) },
      [message('a', 'x', 'שלום', 'Hello')],
      'i18n',
      { code: 'workspace.no-target-locale' },
    ],
  ])('reports %s', async (_name, files, messages, catalog, error) => {
    const app = await open(files);
    expect(await app.save(messages, catalog)).toEqual({ ok: false, error });
  });

  it('reports a source gone since the catalog was listed', async () => {
    const app = await open(tree, {
      open: async (context) => {
        const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
        if (plugin.kind !== 'catalog') throw new Error('test setup');
        const layout = await plugin.open(context);
        if (!layout.ok) return layout;
        // Listed with a source file that isn't there.
        return {
          ok: true,
          value: {
            ...layout.value,
            listCatalogs: async () => {
              const listed = await layout.value.listCatalogs();
              return listed.ok
                ? {
                    ok: true,
                    value: listed.value.map((c) => ({ ...c, path: 'i18n/xx.cat' as ProjectPath })),
                  }
                : listed;
            },
          },
        };
      },
    });
    expect(await app.save([message('a', 'x', 'שלום', 'Hello')])).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: 'i18n' },
    });
  });

  it('passes the format’s errors through: its layout’s and its serializer’s', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const paths = await open(tree, {
      open: async (context) => {
        const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
        if (plugin.kind !== 'catalog') throw new Error('test setup');
        const layout = await plugin.open(context);
        return layout.ok
          ? { ok: true, value: { ...layout.value, targetPathFor: () => err(failure) } }
          : layout;
      },
    });
    expect(await paths.save([message('a', 'x', 'שלום', 'Hello')])).toEqual({
      ok: false,
      error: { ...failure, formatId: 'catalog-fake' },
    });
    const serializer = await open(tree, { serialize: () => err(failure) });
    expect(await serializer.save([message('a', 'x', 'שלום', 'Hello')])).toEqual({
      ok: false,
      error: { ...failure, formatId: 'catalog-fake' },
    });
    expect(await serializer.text(TARGET)).toBe(tree[TARGET]);
  });

  it('reports an unknown project', async () => {
    const save = createSaveCatalog({
      sessions: new InMemoryProjectSessions(randomUUID),
      catalogDrafts: new InMemoryDraftStore(),
      updates: createStatusUpdates(),
    });
    expect(await save('x', { catalog: 'i18n', messages: [] })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});

describe('keepMessagesUpToDate', () => {
  it('records an outdated message as up to date with its source now, leaving the file', async () => {
    const app = await open(tree);
    expect(await app.keep([{ key: 'c', source: 'See you' }])).toEqual({
      ok: true,
      value: [{ key: 'c', status: 'translated' }],
    });
    expect(await app.record()).toEqual({ c: messageFingerprint('See you') });
    expect(await app.text(TARGET)).toBe(tree[TARGET]);
  });

  it('keeps nothing for a message without a translation: it stays missing, with no record', async () => {
    const app = await open({ ...tree, [STATUS]: status({ b: messageFingerprint('Bye') }) });
    expect(await app.keep([{ key: 'b', source: 'Bye' }])).toEqual({
      ok: true,
      value: [{ key: 'b', status: 'missing' }],
    });
    expect(await app.record()).toBeUndefined();
  });

  it.each<[string, FileTree, { key: string; source: string }[], unknown]>([
    [
      'a source that isn’t the one shown',
      tree,
      [{ key: 'c', source: 'See you later' }],
      { code: 'workspace.source-changed', path: 'i18n/en.cat' },
    ],
    [
      'a message the source no longer has',
      tree,
      [{ key: 'gone', source: 'Old' }],
      { code: 'workspace.source-changed', path: 'i18n/en.cat' },
    ],
    [
      'a status file it can’t read',
      { ...tree, [STATUS]: JSON.stringify({ version: 9, pages: {} }) },
      [{ key: 'c', source: 'See you' }],
      { code: 'workspace.status-unsupported', path: STATUS, version: 9 },
    ],
    [
      'a status file it can’t write',
      { ...untranslated, [TARGET]: 'a=שלום\n', '.paperl10n': 'not a folder' },
      [{ key: 'a', source: 'Hello' }],
      {
        code: 'workspace.status-unwritable',
        cause: { code: 'files.not-a-directory', path: STATUS },
      },
    ],
    [
      'a translation its format can’t read',
      { ...tree, [TARGET]: 'not a message\n' },
      [{ key: 'c', source: 'See you' }],
      {
        code: 'formats.invalid-catalog',
        reason: 'not a message: not a message',
        formatId: 'catalog-fake',
      },
    ],
    [
      'a source it can’t read',
      { ...tree, 'i18n/en.cat': new Uint8Array([0xff, 0xfe]) },
      [{ key: 'c', source: 'See you' }],
      {
        code: 'workspace.catalog-unreadable',
        cause: { code: 'files.not-utf8', path: 'i18n/en.cat' },
      },
    ],
    [
      'a catalog the project doesn’t have',
      tree,
      [{ key: 'c', source: 'See you' }],
      { code: 'workspace.unknown-catalog', key: 'nope' },
    ],
    [
      'no target language',
      { ...tree, 'paperl10n.config.json': config({}) },
      [{ key: 'c', source: 'See you' }],
      { code: 'workspace.no-target-locale' },
    ],
  ])('reports %s, writing nothing', async (name, files, messages, error) => {
    const app = await open(files);
    const before = await app.text(STATUS);
    const catalog = name === 'a catalog the project doesn’t have' ? 'nope' : 'i18n';
    expect(await app.keep(messages, catalog)).toEqual({ ok: false, error });
    expect(await app.text(STATUS)).toBe(before);
  });

  it('passes the layout’s errors through, and reports an unknown project', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const app = await open(tree, {
      open: async (context) => {
        const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 3 });
        if (plugin.kind !== 'catalog') throw new Error('test setup');
        const layout = await plugin.open(context);
        return layout.ok
          ? { ok: true, value: { ...layout.value, targetPathFor: () => err(failure) } }
          : layout;
      },
    });
    expect(await app.keep([{ key: 'c', source: 'See you' }])).toEqual({
      ok: false,
      error: { ...failure, formatId: 'catalog-fake' },
    });
    const keep = createKeepMessagesUpToDate({
      sessions: new InMemoryProjectSessions(randomUUID),
      updates: createStatusUpdates(),
    });
    expect(await keep('x', { catalog: 'i18n', messages: [] })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
  });
});
