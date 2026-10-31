// SPDX-License-Identifier: GPL-3.0-or-later
// Every IPC method end to end, without Electron: the preload's API → structured cloning (as IPC
// does) → main's sender and argument checks → the shared app wiring → use cases → the real disk
// adapter and format-stub, over a copy of its "basic" fixture on disk (choosing a target writes to
// the config). Only the folder dialog is faked.
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeFolderPicker } from '#domain-testing/workspace';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
import { nodeDraftStore } from '#adapters/workspace/node-draft-store';
import { InMemoryProjectSessions } from '#adapters/workspace/in-memory-project-sessions';
import type { ApiMethod, PaperLionApi } from '#ipc-contract';
import { createAppApi } from '#app/create-app-api';
import { builtInPlugins } from '#app/plugins';
import { nodeProjectOpener } from '#app/node/node-project-opener';
import { createApi } from '../../src/preload/create-api.ts';
import { registerApi, trustedSenderCheck, type IpcEvent } from '../../src/main/ipc.ts';

const appUrl = 'file:///app/index.html';
const basicFixture = fileURLToPath(
  new URL('../../src/plugins/format-stub/fixtures/basic', import.meta.url),
);
const copies: string[] = [];
afterAll(async () => {
  await Promise.all(copies.map((copy) => rm(copy, { recursive: true, force: true })));
});

/** A fresh copy of the fixture, so writes never touch the repository. */
async function copyOfBasic(): Promise<string> {
  const copy = join(await mkdtemp(join(tmpdir(), 'paperl10n-ipc-')), 'basic');
  copies.push(copy);
  await cp(basicFixture, copy, { recursive: true, verbatimSymlinks: true });
  return copy;
}

let project = '';
beforeAll(async () => {
  project = await copyOfBasic();
});

type Listener = (event: IpcEvent, ...args: unknown[]) => Promise<unknown>;

/** A fresh app-data drafts folder (inside a temporary folder that's cleaned up). */
async function draftsFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'paperl10n-ipc-drafts-'));
  copies.push(folder);
  return join(folder, 'drafts');
}

/**
 * The renderer's API, wired to main's handlers through a cloning "IPC". Each call is a new app
 * session; passing the same drafts folder is like restarting the app.
 */
function rendererApi(
  folder = project,
  drafts = join(tmpdir(), `paperl10n-ipc-unused-${randomUUID()}`),
): { api: PaperLionApi; rejections: string[] } {
  const app = createAppApi({
    folderPicker: new FakeFolderPicker(folder),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(randomUUID),
    drafts: nodeDraftStore(drafts),
    parser: createLezerMarkdownParser(),
    plugins: builtInPlugins,
    onUnexpected: (method, thrown) => {
      throw new Error(`unexpected in ${method}: ${String(thrown)}`);
    },
  });
  if (!app.ok) throw new Error(`test setup: ${JSON.stringify(app.error)}`);

  const listeners = new Map<string, Listener>();
  const rejections: string[] = [];
  registerApi(
    {
      handle: (channel, listener) => {
        listeners.set(channel, listener);
      },
    },
    app.value,
    trustedSenderCheck((url) => url === appUrl),
    (method, reason) => rejections.push(`${method}: ${reason}`),
  );

  const fromAppPage: IpcEvent = { senderFrame: { url: appUrl, parent: null } };
  const api = createApi(async (channel, ...args) => {
    const listener = listeners.get(channel);
    if (listener === undefined) throw new Error(`no handler for ${channel}`);
    return structuredClone(await listener(fromAppPage, ...structuredClone(args)));
  });
  return { api, rejections };
}

async function openBasic(api: PaperLionApi): Promise<string> {
  const opened = await api.openProject();
  if (!opened.ok || opened.value === null)
    throw new Error(`could not open: ${JSON.stringify(opened)}`);
  return opened.value.projectId;
}

// Keyed by ApiMethod: a new method is a compile error here until it has an end-to-end case.
const cases: Record<ApiMethod, () => Promise<void>> = {
  openProject: async () => {
    const { api } = rendererApi();
    expect(await api.openProject()).toEqual({
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
  },
  listSourceDocuments: async () => {
    const { api } = rendererApi();
    const projectId = await openBasic(api);
    expect(await api.listSourceDocuments({ projectId })).toEqual({
      ok: true,
      value: {
        documents: [
          {
            key: 'guide/getting-started',
            sourcePath: 'en/guide/getting-started.md',
            targetPath: 'he/guide/getting-started.md',
            targetExists: false,
            hasDraft: false,
            status: 'missing',
          },
          {
            key: 'index',
            sourcePath: 'en/index.md',
            targetPath: 'he/index.md',
            targetExists: true,
            hasDraft: false,
            status: 'draft',
          },
        ],
        statusFile: { exists: false, problem: null },
      },
    });
  },
  readDocumentPair: async () => {
    const { api } = rendererApi();
    const projectId = await openBasic(api);
    const pair = await api.readDocumentPair({ projectId, key: 'index' });
    if (!pair.ok) throw new Error(`expected a pair: ${JSON.stringify(pair)}`);
    expect(pair.value.source.path).toBe('en/index.md');
    expect(pair.value.source.blocks[0]).toEqual({ kind: 'heading', start: 0, end: 9, depth: 1 });
    expect(pair.value.target?.path).toBe('he/index.md');
    expect(pair.value.target?.text.length).toBeGreaterThan(0);
    expect(pair.value.status).toEqual({
      page: 'draft',
      sections: ['draft'],
      changes: { blocks: [], removals: [] },
      sourceFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/) as string,
    });
  },
  suggestTargetLanguages: async () => {
    const { api } = rendererApi();
    const projectId = await openBasic(api);
    const result = await api.suggestTargetLanguages({
      projectId,
      recent: ['ar', 'he'],
      systemLanguages: ['en-US'],
      uiLanguage: 'he',
    });
    if (!result.ok) throw new Error(`expected suggestions: ${JSON.stringify(result)}`);
    expect(result.value.inProject).toEqual([
      { tag: 'he', name: 'עברית', autonym: 'עברית', direction: 'rtl' },
    ]);
    expect(result.value.recent.map((language) => language.tag)).toEqual(['ar']);
    // English is the source, so it isn't offered; the OS's regional English is, then the region's.
    const suggested = result.value.suggested.map((language) => language.tag);
    expect(suggested[0]).toBe('en-US');
    expect(suggested).not.toContain('en');
    expect(suggested).toContain('es');
  },
  searchTargetLanguages: async () => {
    const { api } = rendererApi();
    const projectId = await openBasic(api);
    const result = await api.searchTargetLanguages({ projectId, query: 'ערבית', uiLanguage: 'he' });
    expect(result.ok && result.value[0]).toEqual({
      tag: 'ar',
      name: 'ערבית',
      autonym: 'العربية',
      direction: 'rtl',
    });
  },
  saveDocument: async () => {
    const folder = await copyOfBasic();
    const { api } = rendererApi(folder);
    const projectId = await openBasic(api);
    const before = await readFile(join(folder, 'he/index.md'), 'utf8');
    const edited = `${before}\r\nשורה חדשה ✓\r\n`;
    expect(await api.saveDocument({ projectId, key: 'index', text: edited, base: before })).toEqual(
      {
        ok: true,
        value: { path: 'he/index.md', written: true },
      },
    );
    expect(await readFile(join(folder, 'he/index.md'), 'utf8')).toBe(edited);
    // A new translation, in a folder that doesn't exist yet.
    expect(
      await api.saveDocument({
        projectId,
        key: 'guide/getting-started',
        text: '# התחלה\n',
        base: null,
      }),
    ).toEqual({ ok: true, value: { path: 'he/guide/getting-started.md', written: true } });
    expect(await readFile(join(folder, 'he/guide/getting-started.md'), 'utf8')).toBe('# התחלה\n');
    // Saving over a file that changed since: refused, as an error DTO.
    expect(await api.saveDocument({ projectId, key: 'index', text: 'x', base: before })).toEqual({
      ok: false,
      error: { code: 'workspace.document-changed', params: { file: 'he/index.md' }, details: [] },
    });
  },
  saveDraft: async () => {
    const folder = await copyOfBasic();
    const drafts = await draftsFolder();
    const first = rendererApi(folder, drafts).api;
    const before = await readFile(join(folder, 'he/index.md'), 'utf8');
    const projectId = await openBasic(first);
    const text = `${before}טיוטה ✓\r\n`;
    expect(await first.saveDraft({ projectId, key: 'index', text, base: before })).toEqual({
      ok: true,
      value: null,
    });
    // The project folder is untouched: drafts live in the app's data.
    expect(await readFile(join(folder, 'he/index.md'), 'utf8')).toBe(before);

    // After a restart, the page lists as drafted and opens with its draft; saving forgets it.
    const second = rendererApi(folder, drafts).api;
    const reopened = await openBasic(second);
    const listed = await second.listSourceDocuments({ projectId: reopened });
    expect(listed.ok && listed.value.documents.map((entry) => [entry.key, entry.hasDraft])).toEqual(
      [
        ['guide/getting-started', false],
        ['index', true],
      ],
    );
    const pair = await second.readDocumentPair({ projectId: reopened, key: 'index' });
    expect(pair.ok && pair.value.draft).toEqual({ text, base: before });
    await second.saveDocument({ projectId: reopened, key: 'index', text, base: before });
    const after = await second.readDocumentPair({ projectId: reopened, key: 'index' });
    expect(after.ok && after.value.draft).toBeNull();
  },
  discardDraft: async () => {
    const drafts = await draftsFolder();
    const { api } = rendererApi(project, drafts);
    const projectId = await openBasic(api);
    await api.saveDraft({ projectId, key: 'guide/getting-started', text: 'x', base: null });
    expect(await api.discardDraft({ projectId, key: 'guide/getting-started' })).toEqual({
      ok: true,
      value: null,
    });
    const pair = await api.readDocumentPair({ projectId, key: 'guide/getting-started' });
    expect(pair.ok && pair.value.draft).toBeNull();
  },
  checkTranslation: async () => {
    const { api } = rendererApi();
    const projectId = await openBasic(api);
    // The source: "# Welcome" and "This is the home page." The translation, unsaved, adds a link.
    const text = '# ברוכים הבאים\n\nזה [דף](/x/) הבית.\n';
    expect(await api.checkTranslation({ projectId, key: 'index', text })).toEqual({
      ok: true,
      value: {
        page: [{ kind: 'link', missing: [], extra: ['/x/'] }],
        sections: [[{ kind: 'link', missing: [], extra: ['/x/'] }]],
        // Characters other than whitespace, without syntax or the link's target.
        length: { source: 25, translation: 20 },
      },
    });
    expect(await api.checkTranslation({ projectId, key: 'nope', text })).toMatchObject({
      ok: false,
      error: { code: 'workspace.unknown-document' },
    });
  },
  markUpToDate: async () => {
    const folder = await copyOfBasic();
    const { api } = rendererApi(folder);
    const projectId = await openBasic(api);
    const pair = await api.readDocumentPair({ projectId, key: 'index' });
    if (!pair.ok) throw new Error(`expected a pair: ${JSON.stringify(pair)}`);
    const { sourceFingerprint } = pair.value.status;
    expect(
      await api.markUpToDate({ projectId, key: 'index', sourceFingerprint, sections: null }),
    ).toEqual({
      ok: true,
      value: {
        page: 'translated',
        sections: ['translated'],
        changes: { blocks: [], removals: [] },
      },
    });
    const written = await readFile(join(folder, '.paperl10n/status/he.json'), 'utf8');
    expect(written).toMatch(/^\{\n {2}"version": 1,\n {2}"pages": \{\n {4}"index": \[\n/);
    const listed = await api.listSourceDocuments({ projectId });
    expect(listed.ok && listed.value.statusFile).toEqual({ exists: true, problem: null });
    expect(listed.ok && listed.value.documents.map((entry) => entry.status)).toEqual([
      'missing',
      'translated',
    ]);

    // The source changes on disk: the page is outdated, and marking the old version is refused.
    await writeFile(join(folder, 'en/index.md'), '# Welcome\n\nThis is the new home page.\n');
    const outdated = await api.readDocumentPair({ projectId, key: 'index' });
    expect(outdated.ok && outdated.value.status.page).toBe('outdated');
    // The changed paragraph, as the real parser places it.
    expect(outdated.ok && outdated.value.status.changes).toEqual({
      blocks: [{ kind: 'changed', range: { start: 11, end: 37 } }],
      removals: [],
    });
    expect(
      await api.markUpToDate({ projectId, key: 'index', sourceFingerprint, sections: [0] }),
    ).toEqual({
      ok: false,
      error: { code: 'workspace.source-changed', params: { file: 'en/index.md' }, details: [] },
    });
    expect(await readFile(join(folder, '.paperl10n/status/he.json'), 'utf8')).toBe(written);
  },
  markExistingUpToDate: async () => {
    const folder = await copyOfBasic();
    const { api } = rendererApi(folder);
    const projectId = await openBasic(api);
    expect(await api.markExistingUpToDate({ projectId })).toEqual({
      ok: true,
      value: { marked: ['index'] },
    });
    const listed = await api.listSourceDocuments({ projectId });
    expect(listed.ok && listed.value.documents.map((entry) => entry.status)).toEqual([
      'missing',
      'translated',
    ]);
    // A broken status file (a merge conflict) lists pages as never marked, says why, and is
    // never overwritten.
    const conflicted = '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n';
    await writeFile(join(folder, '.paperl10n/status/he.json'), conflicted);
    const broken = await api.listSourceDocuments({ projectId });
    expect(broken.ok && broken.value.documents.map((entry) => entry.status)).toEqual([
      'missing',
      'draft',
    ]);
    expect(broken.ok && broken.value.statusFile.problem?.code).toBe('workspace.status-invalid');
    expect(await api.markExistingUpToDate({ projectId })).toMatchObject({
      ok: false,
      error: { code: 'workspace.status-invalid', params: { file: '.paperl10n/status/he.json' } },
    });
    expect(await readFile(join(folder, '.paperl10n/status/he.json'), 'utf8')).toBe(conflicted);
  },
  chooseTargetLocale: async () => {
    const folder = await copyOfBasic();
    const { api } = rendererApi(folder);
    const projectId = await openBasic(api);
    expect(await api.chooseTargetLocale({ projectId, language: 'AR' })).toEqual({
      ok: true,
      value: { id: 'ar', direction: 'rtl' },
    });
    const listed = await api.listSourceDocuments({ projectId });
    expect(listed.ok && listed.value.documents.map((entry) => entry.targetPath)).toEqual([
      'ar/guide/getting-started.md',
      'ar/index.md',
    ]);
    expect(await readFile(join(folder, 'paperl10n.config.json'), 'utf8')).toBe(
      (await readFile(join(basicFixture, 'paperl10n.config.json'), 'utf8')).replace(
        '"targetLocale": "he"',
        '"targetLocale": "ar"',
      ),
    );
  },
};

describe('every IPC method, end to end without Electron', () => {
  it.each(Object.entries(cases))('%s', async (_method, run) => {
    await run();
  });

  it('turns a use-case error into an error DTO across the whole chain', async () => {
    const { api } = rendererApi();
    expect(await api.listSourceDocuments({ projectId: 'not-open' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project', params: {}, details: [] },
    });
  });

  it("rejects arguments main's validation refuses, without reaching the app", async () => {
    const { api, rejections } = rendererApi();
    expect(await api.listSourceDocuments({ projectId: 'x'.repeat(201) })).toEqual({
      ok: false,
      error: { code: 'internal.invalid-request', params: {}, details: [] },
    });
    expect(rejections).toEqual(['listSourceDocuments: invalid-arguments']);
  });
});
