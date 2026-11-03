// SPDX-License-Identifier: GPL-3.0-or-later
// Marking existing translations up to date in a project with catalogs: every translated message
// of a catalog never recorded is recorded, with the pages, in one write of the status file.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry, type CatalogFormat } from '#domains/formats';
import { messageFingerprint } from '#domains/translation';
import { LineMarkdownParser } from '#domain-testing/document';
import {
  detects,
  fakeCatalogPlugin,
  fakeDocumentPlugin,
  type FileTree,
} from '#domain-testing/formats';
import { err } from '#kernel/result';
import type { ProjectPath } from '#kernel/project-path';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createListCatalogs } from './list-catalogs.ts';
import { createMarkExistingUpToDate } from './mark-up-to-date.ts';
import { createOpenProject } from './open-project.ts';
import { createStatusUpdates } from './translation-status.ts';

const STATUS = '.paperl10n/status/he.json' as ProjectPath;
const config = JSON.stringify({ sourceLocale: 'en', targetLocale: 'he' });
const tree: FileTree = {
  'paperl10n.config.json': config,
  'en/index.md': 'Intro\n',
  'he/index.md': 'מבוא\n',
  // `b` is empty and `c` missing: nothing to record. `old` isn't in the source.
  // Each file says its role: read as another, it's malformed.
  'i18n/en.cat': '# role: source\na=Hello\nb=Bye\nc=New\n',
  'i18n/he.cat': '# role: target\na=שלום\nb=\nold=ישן\n',
  'api/en.cat': 'x=X\n',
  'api/he.cat': 'x=איקס\n',
  // No translation at all.
  'lib/en.cat': 'y=Y\n',
};

async function open(
  files: FileTree = tree,
  options: { pages?: boolean; catalogFormat?: Partial<CatalogFormat> } = {},
) {
  const catalogs = fakeCatalogPlugin('catalog-fake', {
    ...detects('likely'),
    ...options.catalogFormat,
  });
  const plugins =
    options.pages === false
      ? [catalogs]
      : [fakeDocumentPlugin('format-fake', detects('likely')), catalogs];
  const registry = createFormatRegistry(plugins, { apiVersion: 4 });
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
  const projectId = opened.value.projectId;
  const disk = opener.opened.get('/p');
  if (disk === undefined) throw new Error('test setup');
  const markExisting = createMarkExistingUpToDate({
    sessions,
    parser: new LineMarkdownParser(),
    updates: createStatusUpdates(),
  });
  const list = createListCatalogs({ sessions, catalogDrafts: new InMemoryDraftStore() });
  return {
    disk,
    markExisting: () => markExisting(projectId),
    /** Each catalog's messages up to date, as listed. */
    upToDate: async () => {
      const listed = await list(projectId);
      if (!listed.ok) throw new Error(JSON.stringify(listed.error));
      return Object.fromEntries(
        listed.value.catalogs.map((c) => [c.key, c.progress?.byStatus.translated ?? null]),
      );
    },
    /** The status file's catalogs section, or `null` without a file. */
    recorded: async () => {
      const text = await disk.readText(STATUS);
      return text.ok ? (JSON.parse(text.value) as { catalogs?: unknown }).catalogs : null;
    },
  };
}

describe('markExistingUpToDate, for catalogs', () => {
  it('records every translated message against its source as it is now, with the pages', async () => {
    const app = await open();
    expect(await app.upToDate()).toEqual({ api: 0, i18n: 0, lib: 0 });
    expect(await app.markExisting()).toEqual({
      ok: true,
      value: { marked: ['index'], markedMessages: 2 },
    });
    expect(await app.upToDate()).toEqual({ api: 1, i18n: 1, lib: 0 });
    expect(await app.recorded()).toEqual({
      api: { x: messageFingerprint('X') },
      i18n: { a: messageFingerprint('Hello') },
    });
  });

  it('keeps the catalogs the status file records, and records the others', async () => {
    const fingerprint = '0'.repeat(16);
    const status = JSON.stringify({
      version: 2,
      pages: {},
      catalogs: { i18n: { b: fingerprint } },
    });
    const app = await open({ ...tree, [STATUS]: status });
    expect(await app.markExisting()).toEqual({
      ok: true,
      value: { marked: ['index'], markedMessages: 1 },
    });
    expect(await app.recorded()).toEqual({
      api: { x: messageFingerprint('X') },
      i18n: { b: fingerprint },
    });
  });

  it.each([
    ['source', 'api/en.cat'],
    ['translation', 'api/he.cat'],
  ])('leaves a catalog whose %s can’t be read as it is', async (_name, path) => {
    const app = await open({ ...tree, [path]: 'not a message' });
    expect(await app.markExisting()).toEqual({
      ok: true,
      value: { marked: ['index'], markedMessages: 1 },
    });
    expect(await app.recorded()).toEqual({ i18n: { a: messageFingerprint('Hello') } });
  });

  it('marks the messages of a project without pages', async () => {
    const app = await open(tree, { pages: false });
    expect(await app.markExisting()).toEqual({
      ok: true,
      value: { marked: [], markedMessages: 2 },
    });
    expect(await app.upToDate()).toEqual({ api: 1, i18n: 1, lib: 0 });
  });

  it('writes nothing when no message is translated', async () => {
    const app = await open(
      { 'paperl10n.config.json': config, 'lib/en.cat': 'y=Y\n' },
      { pages: false },
    );
    expect(await app.markExisting()).toEqual({
      ok: true,
      value: { marked: [], markedMessages: 0 },
    });
    expect(await app.recorded()).toBeNull();
  });

  it('passes the layout’s errors through, and writes nothing', async () => {
    const failure = { code: 'formats.unsupported-project' as const, reason: 'boom' };
    const layoutWith = (changes: object): Partial<CatalogFormat> => ({
      open: async (context) => {
        const plugin = fakeCatalogPlugin('catalog-fake').create({ apiVersion: 4 });
        if (plugin.kind !== 'catalog') throw new Error('test setup');
        const layout = await plugin.open(context);
        return layout.ok ? { ok: true, value: { ...layout.value, ...changes } } : layout;
      },
    });
    for (const changes of [
      { listCatalogs: () => Promise.resolve(err(failure)) },
      { targetPathFor: () => err(failure) },
    ]) {
      const app = await open(tree, { catalogFormat: layoutWith(changes) });
      expect(await app.markExisting()).toEqual({
        ok: false,
        error: { ...failure, formatId: 'catalog-fake' },
      });
      expect(await app.recorded()).toBeNull();
    }
  });
});
