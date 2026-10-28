// SPDX-License-Identifier: GPL-3.0-or-later
// Every IPC method end to end, without Electron: the preload's API → structured cloning (as IPC
// does) → main's sender and argument checks → the shared app wiring → use cases → the real disk
// adapter and format-stub, over its "basic" fixture on disk. Only the folder dialog is faked.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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

type Listener = (event: IpcEvent, ...args: unknown[]) => Promise<unknown>;

/** The renderer's API, wired to main's handlers through a cloning "IPC". */
function rendererApi(): { api: PaperLionApi; rejections: string[] } {
  const app = createAppApi({
    folderPicker: new FakeFolderPicker(basicFixture),
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
