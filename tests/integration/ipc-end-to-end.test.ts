// SPDX-License-Identifier: GPL-3.0-or-later
// Every IPC method end to end, without Electron: the preload's API → structured cloning (as IPC
// does) → main's sender and argument checks → the shared app wiring → use cases → the real disk
// adapter and format-stub, over a copy of its "basic" fixture on disk (choosing a target writes to
// the config). Only the folder dialog is faked.
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeFolderPicker } from '#domain-testing/workspace';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
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

/** The renderer's API, wired to main's handlers through a cloning "IPC". */
function rendererApi(folder = project): { api: PaperLionApi; rejections: string[] } {
  const app = createAppApi({
    folderPicker: new FakeFolderPicker(folder),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(randomUUID),
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
      value: [
        {
          key: 'guide/getting-started',
          sourcePath: 'en/guide/getting-started.md',
          targetPath: 'he/guide/getting-started.md',
          targetExists: false,
        },
        { key: 'index', sourcePath: 'en/index.md', targetPath: 'he/index.md', targetExists: true },
      ],
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
  chooseTargetLocale: async () => {
    const folder = await copyOfBasic();
    const { api } = rendererApi(folder);
    const projectId = await openBasic(api);
    expect(await api.chooseTargetLocale({ projectId, language: 'AR' })).toEqual({
      ok: true,
      value: { id: 'ar', direction: 'rtl' },
    });
    const listed = await api.listSourceDocuments({ projectId });
    expect(listed.ok && listed.value.map((entry) => entry.targetPath)).toEqual([
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
