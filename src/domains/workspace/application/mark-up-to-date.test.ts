// SPDX-License-Identifier: GPL-3.0-or-later
// Status through the use cases: marking up to date, and the statuses the page list and an open
// page report from the status file.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { LineMarkdownParser } from '#domain-testing/document';
import { detects, fakeDocumentPlugin, type FileTree } from '#domain-testing/formats';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import { FakeFolderPicker, FakeProjectFilesOpener } from '../testing/fakes.ts';
import { createListSourceDocuments } from './list-source-documents.ts';
import { createMarkExistingUpToDate, createMarkUpToDate } from './mark-up-to-date.ts';
import { createOpenProject } from './open-project.ts';
import { createReadDocumentPair } from './read-document-pair.ts';
import { createStatusUpdates } from './translation-status.ts';

const STATUS = '.paperl10n/status/he.json';
const source = 'Intro\n## A\na\n## B\nb\n';

async function openWith(tree: FileTree, settings: object = { targetLocale: 'he' }) {
  const registry = createFormatRegistry([fakeDocumentPlugin('format-fake', detects('likely'))], {
    apiVersion: 2,
  });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opener = new FakeProjectFilesOpener({
    '/p': { 'paperl10n.config.json': JSON.stringify(settings), ...tree },
  });
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener,
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const parser = new LineMarkdownParser();
  const drafts = new InMemoryDraftStore();
  const deps = { sessions, parser, updates: createStatusUpdates() };
  const files = opener.opened.get('/p');
  if (files === undefined) throw new Error('test setup');
  const projectId = opened.value.projectId;
  const list = createListSourceDocuments({ sessions, drafts, parser });
  const read = createReadDocumentPair({ sessions, drafts, parser });
  return {
    projectId,
    files,
    parser,
    mark: createMarkUpToDate(deps),
    markExisting: createMarkExistingUpToDate(deps),
    /** Each page's status, by key, as listed. */
    statuses: async () => {
      const listed = await list(projectId);
      if (!listed.ok) throw new Error(JSON.stringify(listed.error));
      return Object.fromEntries(listed.value.documents.map((entry) => [entry.key, entry.status]));
    },
    listed: () => list(projectId),
    /** The page's status as it opens, and its source's fingerprint. */
    opened: async (key = 'index') => {
      const pair = await read(projectId, key);
      if (!pair.ok) throw new Error(JSON.stringify(pair.error));
      return pair.value.status;
    },
    statusFile: async () => {
      const text = await files.readText(STATUS as ProjectPath);
      return text.ok ? text.value : null;
    },
  };
}

const translated = { 'en/index.md': source, 'he/index.md': 'מבוא\n## א\nא\n## ב\nב\n' };

describe('markUpToDate', () => {
  it('marks a whole page, writes the status file, and returns the status after', async () => {
    const app = await openWith(translated);
    const { sourceFingerprint, page, sections } = await app.opened();
    expect([page, sections]).toEqual(['draft', ['draft', 'draft', 'draft']]);
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: null }),
    ).toEqual({
      ok: true,
      value: { page: 'translated', sections: ['translated', 'translated', 'translated'] },
    });
    expect(await app.statusFile()).toMatch(
      /^\{\n {2}"version": 1,\n {2}"pages": \{\n {4}"index": \[/,
    );
    expect(await app.opened()).toMatchObject({ page: 'translated' });
    expect(await app.statuses()).toEqual({ index: 'translated' });
  });

  it('marks some sections, and the others stay as they were', async () => {
    const app = await openWith(translated);
    const { sourceFingerprint } = await app.opened();
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: [0, 2] }),
    ).toEqual({
      ok: true,
      value: { page: 'draft', sections: ['translated', 'draft', 'translated'] },
    });
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: [1] }),
    ).toEqual({
      ok: true,
      value: { page: 'translated', sections: ['translated', 'translated', 'translated'] },
    });
  });

  it('shows the source’s changes as outdated, by section, until marked again', async () => {
    const app = await openWith(translated);
    const first = await app.opened();
    await app.mark(app.projectId, {
      key: 'index',
      sourceFingerprint: first.sourceFingerprint,
      sections: null,
    });
    await app.files.writeText('en/index.md' as ProjectPath, 'Intro\n## A\na, changed\n## B\nb\n');
    const changed = await app.opened();
    expect([changed.page, changed.sections]).toEqual([
      'outdated',
      ['translated', 'outdated', 'translated'],
    ]);
    expect(await app.statuses()).toEqual({ index: 'outdated' });
    expect(
      await app.mark(app.projectId, {
        key: 'index',
        sourceFingerprint: changed.sourceFingerprint,
        sections: [1],
      }),
    ).toMatchObject({ ok: true, value: { page: 'translated' } });
  });

  it('refuses to mark a source that changed on disk since the page showed it', async () => {
    const app = await openWith(translated);
    const { sourceFingerprint } = await app.opened();
    await app.files.writeText('en/index.md' as ProjectPath, 'Intro, changed\n');
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: null }),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.source-changed', path: 'en/index.md' },
    });
    expect(await app.statusFile()).toBeNull();
  });

  it('refuses a section the source doesn’t have', async () => {
    const app = await openWith(translated);
    const { sourceFingerprint } = await app.opened();
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: [3] }),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.source-changed', path: 'en/index.md' },
    });
  });

  it('never overwrites a status file it can’t read, and says why', async () => {
    const conflicted = '<<<<<<< HEAD\n{}\n=======\n';
    const app = await openWith({ ...translated, [STATUS]: conflicted });
    const { sourceFingerprint, page } = await app.opened();
    expect(page).toBe('draft');
    const marked = await app.mark(app.projectId, {
      key: 'index',
      sourceFingerprint,
      sections: null,
    });
    expect(marked).toMatchObject({
      ok: false,
      error: { code: 'workspace.status-invalid', path: STATUS },
    });
    expect(await app.statusFile()).toBe(conflicted);
  });

  it('never overwrites a status file from a newer Paper Lion', async () => {
    const newer = '{"version":2,"pages":{}}';
    const app = await openWith({ ...translated, [STATUS]: newer });
    const { sourceFingerprint } = await app.opened();
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: null }),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.status-unsupported', path: STATUS, version: 2 },
    });
    expect(await app.statusFile()).toBe(newer);
  });

  it('reports a status file that can’t be written', async () => {
    // A file where the status folder should be.
    const app = await openWith({ ...translated, '.paperl10n': 'not a folder' });
    const { sourceFingerprint } = await app.opened();
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: null }),
    ).toEqual({
      ok: false,
      error: {
        code: 'workspace.status-unwritable',
        cause: { code: 'files.not-a-directory', path: STATUS },
      },
    });
  });

  it('keeps both of two marks made at once', async () => {
    const app = await openWith({
      ...translated,
      'en/about.md': 'About\n',
      'he/about.md': 'אודות\n',
    });
    const index = await app.opened('index');
    const about = await app.opened('about');
    const results = await Promise.all([
      app.mark(app.projectId, {
        key: 'index',
        sourceFingerprint: index.sourceFingerprint,
        sections: null,
      }),
      app.mark(app.projectId, {
        key: 'about',
        sourceFingerprint: about.sourceFingerprint,
        sections: null,
      }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await app.statuses()).toEqual({ about: 'translated', index: 'translated' });
  });

  it.each([
    ['an unknown project', 'nope', 'index', { code: 'workspace.unknown-project' }],
    ['an unknown page', undefined, 'nope', { code: 'workspace.unknown-document', key: 'nope' }],
  ])('reports %s', async (_description, projectId, key, error) => {
    const app = await openWith(translated);
    expect(
      await app.mark(projectId ?? app.projectId, { key, sourceFingerprint: 'f', sections: null }),
    ).toEqual({ ok: false, error });
  });

  it('reports a project without a target language', async () => {
    const app = await openWith(translated, {});
    expect(
      await app.mark(app.projectId, { key: 'index', sourceFingerprint: 'f', sections: null }),
    ).toEqual({ ok: false, error: { code: 'workspace.no-target-locale' } });
    expect(await app.markExisting(app.projectId)).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });
});

describe('markExistingUpToDate', () => {
  const tree = {
    ...translated,
    'en/about.md': 'About\n',
    'he/about.md': 'אודות\n',
    'en/new.md': 'New\n',
  };

  it('marks every existing translation never recorded, and only those', async () => {
    const app = await openWith(tree);
    // `about` is recorded already, with one section never marked: it keeps its record.
    const about = await app.opened('about');
    await app.mark(app.projectId, {
      key: 'about',
      sourceFingerprint: about.sourceFingerprint,
      sections: [],
    });
    expect(await app.statuses()).toEqual({ about: 'draft', index: 'draft', new: 'missing' });
    expect(await app.markExisting(app.projectId)).toEqual({
      ok: true,
      value: { marked: ['index'] },
    });
    expect(await app.statuses()).toEqual({ about: 'draft', index: 'translated', new: 'missing' });
  });

  it('writes nothing when there’s nothing to mark', async () => {
    const app = await openWith({ 'en/new.md': 'New\n' });
    expect(await app.markExisting(app.projectId)).toEqual({ ok: true, value: { marked: [] } });
    expect(await app.statusFile()).toBeNull();
  });

  it('never overwrites a status file it can’t read', async () => {
    const app = await openWith({ ...tree, [STATUS]: 'nope' });
    expect(await app.markExisting(app.projectId)).toMatchObject({
      ok: false,
      error: { code: 'workspace.status-invalid' },
    });
    expect(await app.statusFile()).toBe('nope');
  });
});

describe('status in the page list', () => {
  it('says whether the status file exists, and why it can’t be read', async () => {
    const fresh = await openWith(translated);
    expect(await fresh.listed()).toMatchObject({
      ok: true,
      value: { statusFile: { exists: false, problem: null } },
    });
    const broken = await openWith({ ...translated, [STATUS]: '[]' });
    expect(await broken.listed()).toMatchObject({
      ok: true,
      value: {
        documents: [{ key: 'index', status: 'draft' }],
        statusFile: {
          exists: false,
          problem: { code: 'workspace.status-invalid', problem: 'must be a JSON object' },
        },
      },
    });
  });

  it('reads the sources of recorded pages only', async () => {
    const app = await openWith({
      ...translated,
      'en/about.md': 'About\n',
      'he/about.md': 'אודות\n',
    });
    const { sourceFingerprint } = await app.opened('index');
    await app.mark(app.projectId, { key: 'index', sourceFingerprint, sections: null });
    app.parser.calls.length = 0;
    expect(await app.statuses()).toEqual({ about: 'draft', index: 'translated' });
    expect(app.parser.calls.map((call) => call.text)).toEqual([source]);
  });
});
