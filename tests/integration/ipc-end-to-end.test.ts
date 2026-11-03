// SPDX-License-Identifier: GPL-3.0-or-later
// Every IPC method end to end, without Electron: the preload's API → structured cloning (as IPC
// does) → main's sender and argument checks → the shared app wiring → use cases → the real disk
// adapter and format-stub, over a copy of its "basic" fixture on disk (choosing a target writes to
// the config). Only the folder dialog is faked.
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeFolderPicker } from '#domain-testing/workspace';
import { messageFingerprint } from '#domains/translation';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
import { nodeDraftStore } from '#adapters/workspace/node-draft-store';
import { InMemoryProjectSessions } from '#adapters/workspace/in-memory-project-sessions';
import type { ApiMethod, PaperLionApi } from '#ipc-contract';
import { createAppApi } from '#app/create-app-api';
import { builtInPlugins } from '#app/plugins';
import { readAboutFiles } from '#app/node/about-files';
import { nodeProjectOpener } from '#app/node/node-project-opener';
import { createApi } from '../../src/preload/create-api.ts';
import { registerApi, trustedSenderCheck, type IpcEvent } from '../../src/main/ipc.ts';

const appUrl = 'file:///app/index.html';
const basicFixture = fileURLToPath(
  new URL('../../src/plugins/format-stub/fixtures/basic', import.meta.url),
);
const extensionFixture = fileURLToPath(
  new URL('../../src/plugins/catalog-banana/fixtures/mediawiki-extension', import.meta.url),
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

/** A copy of catalog-banana's MediaWiki extension (its config targets Hebrew), with a status file
 * recording one message as up to date and one against an older source. */
async function copyOfExtension(): Promise<string> {
  const copy = join(await mkdtemp(join(tmpdir(), 'paperl10n-ipc-')), 'extension');
  copies.push(copy);
  await cp(extensionFixture, copy, { recursive: true });
  const source = JSON.parse(await readFile(join(copy, 'i18n/en.json'), 'utf8')) as Record<
    string,
    string
  >;
  const desc = source['example-desc'] ?? '';
  const status = {
    version: 2,
    pages: {},
    catalogs: {
      i18n: {
        'example-desc': messageFingerprint(desc),
        'example-last': messageFingerprint('An older source'),
      },
    },
  };
  await mkdir(join(copy, '.paperl10n/status'), { recursive: true });
  await writeFile(join(copy, '.paperl10n/status/he.json'), JSON.stringify(status));
  return copy;
}

const gettextFixture = fileURLToPath(
  new URL('../../src/plugins/catalog-gettext/fixtures/side-by-side', import.meta.url),
);

/** A copy of catalog-gettext's side-by-side project (its config targets Hebrew). */
async function copyOfGettext(): Promise<string> {
  const copy = join(await mkdtemp(join(tmpdir(), 'paperl10n-ipc-')), 'gettext');
  copies.push(copy);
  await cp(gettextFixture, copy, { recursive: true });
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
    readAbout: () =>
      readAboutFiles({
        name: 'Paper Lion',
        version: '1.2.3',
        licenseFile: fileURLToPath(new URL('../fixtures/about/LICENSE', import.meta.url)),
        componentsFile: fileURLToPath(
          new URL('../fixtures/about/third-party-licenses.json', import.meta.url),
        ),
      }),
    folderPicker: new FakeFolderPicker(folder),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(randomUUID),
    drafts: nodeDraftStore(drafts),
    catalogDrafts: nodeDraftStore(`${drafts}-catalogs`),
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
  getAbout: async () => {
    const { api } = rendererApi();
    expect(await api.getAbout()).toEqual({
      ok: true,
      value: {
        name: 'Paper Lion',
        version: '1.2.3',
        licenseText: 'A stand-in licence, for tests.\n',
        components: [
          {
            name: 'electron',
            version: '45.0.0',
            license: 'MIT',
            homepage: 'https://www.electronjs.org',
          },
          { name: 'vue', version: '3.5.44', license: 'MIT', homepage: null },
        ],
      },
    });
  },
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
        catalogFormat: null,
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
  listCatalogs: async () => {
    // A project with catalogs only: no document format, and its pages list empty.
    const { api } = rendererApi(await copyOfExtension());
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    expect([opened.value.documentFormat, opened.value.catalogFormat]).toEqual([
      null,
      { id: 'catalog-banana', displayName: 'banana-i18n' },
    ]);
    const { projectId } = opened.value;
    expect(await api.listSourceDocuments({ projectId })).toMatchObject({
      ok: true,
      value: { documents: [] },
    });
    expect(await api.listCatalogs({ projectId })).toEqual({
      ok: true,
      value: {
        catalogs: [
          {
            key: 'i18n',
            sourcePath: 'i18n/en.json',
            targetPath: 'i18n/he.json',
            targetExists: true,
            hasDraft: false,
            progress: {
              total: 5,
              byStatus: { missing: 2, draft: 1, translated: 1, outdated: 1 },
              notInSource: 1,
            },
            problem: null,
          },
          {
            key: 'i18n/api',
            sourcePath: 'i18n/api/en.json',
            targetPath: 'i18n/api/he.json',
            targetExists: false,
            hasDraft: false,
            progress: {
              total: 2,
              byStatus: { missing: 2, draft: 0, translated: 0, outdated: 0 },
              notInSource: 0,
            },
            problem: null,
          },
        ],
        statusFile: { exists: true, problem: null },
      },
    });
  },
  readCatalog: async () => {
    const { api } = rendererApi(await copyOfExtension());
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId } = opened.value;
    const read = await api.readCatalog({ projectId, key: 'i18n' });
    if (!read.ok) throw new Error(JSON.stringify(read));
    expect(read.value).toMatchObject({
      key: 'i18n',
      sourcePath: 'i18n/en.json',
      targetPath: 'i18n/he.json',
      targetExists: true,
      documentationPath: 'i18n/qqq.json',
      documentationProblem: null,
      pluralForms: [],
      statusFile: { exists: true, problem: null },
    });
    expect(read.value.messages.map((m) => [m.key, m.status])).toEqual([
      ['example-desc', 'translated'],
      ['example-count', 'missing'],
      ['example-link', 'draft'],
      ['example-bold', 'missing'],
      ['example-last', 'outdated'],
    ]);
    const count = read.value.messages[1];
    expect(count?.documentation).toBe('Parameters:\n* $1 - the number of examples');
    expect(count?.translation).toBeNull();
    expect(count?.sourceTokens.map((t) => t.kind)).toEqual(['plural', 'parameter', 'parameter']);
    expect(count?.sourceTokens[0]).toEqual({ kind: 'plural', start: 6, end: 50 });
    expect(read.value.notInSource.map((m) => m.key)).toEqual(['example-removed']);

    expect(await api.readCatalog({ projectId, key: 'nope' })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', params: { key: 'nope' }, details: [] },
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
  checkMessage: async () => {
    const { api } = rendererApi(await copyOfExtension());
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId } = opened.value;
    // The source: "There {{PLURAL:$1|is one example|are $1 examples}}." The translation, unsaved,
    // keeps the plural (and so its `$1`), and adds a link.
    const text = 'יש {{PLURAL:$1|דוגמה אחת|הרבה דוגמאות}} ב[[Help:Example]].';
    expect(
      await api.checkMessage({ projectId, catalog: 'i18n', key: 'example-count', text }),
    ).toEqual({
      ok: true,
      value: {
        tokens: [
          { kind: 'plural', start: 3, end: 39 },
          { kind: 'parameter', start: 12, end: 14 },
          { kind: 'link', start: 41, end: 57 },
        ],
        warnings: [{ kind: 'unexpected', token: 'link', value: 'Help:Example' }],
        forms: null,
      },
    });
    expect(
      await api.checkMessage({
        projectId,
        catalog: 'i18n',
        key: 'example-last',
        text: 'הודעה [אחרונה',
      }),
    ).toEqual({
      ok: true,
      value: { tokens: [], warnings: [{ kind: 'unbalanced', brackets: '[]' }], forms: null },
    });
    expect(await api.checkMessage({ projectId, catalog: 'i18n', key: 'nope', text })).toEqual({
      ok: false,
      error: {
        code: 'workspace.unknown-message',
        params: { catalog: 'i18n', key: 'nope' },
        details: [],
      },
    });
  },
  saveCatalog: async () => {
    const folder = await copyOfExtension();
    const { api } = rendererApi(folder);
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId } = opened.value;
    const save = await api.saveCatalog({
      projectId,
      catalog: 'i18n',
      messages: [
        {
          key: 'example-count',
          text: 'יש {{PLURAL:$1|דוגמה אחת|$1 דוגמאות}}.',
          base: null,
          source: 'There {{PLURAL:$1|is one example|are $1 examples}}.',
        },
        { key: 'example-removed', text: '', base: 'הודעה שכבר לא קיימת במקור', source: null },
      ],
    });
    expect(save).toEqual({
      ok: true,
      value: {
        path: 'i18n/he.json',
        written: true,
        messages: [
          { key: 'example-count', status: 'translated' },
          { key: 'example-removed', status: null },
        ],
        statusProblem: null,
      },
    });
    // Patched in place: the new message after the one before it in the source, tabs kept, the
    // removed one gone, every other byte as it was.
    expect(await readFile(join(folder, 'i18n/he.json'), 'utf8')).toBe(
      [
        '{',
        '\t"@metadata": {',
        '\t\t"authors": [',
        '\t\t\t"Moriel"',
        '\t\t]',
        '\t},',
        '\t"example-desc": "מציג [[Special:Example|דוגמאות]] {{GENDER:$1|לו|לה|להם}}.",',
        '\t"example-count": "יש {{PLURAL:$1|דוגמה אחת|$1 דוגמאות}}.",',
        '\t"example-link": "ראו את [https://www.mediawiki.org/wiki/Extension:Example המדריך] ב{{SITENAME}}.",',
        '\t"example-last": "הודעה אחרונה"',
        '}',
        '',
      ].join('\n'),
    );
    const read = await api.readCatalog({ projectId, key: 'i18n' });
    expect(read.ok && read.value.messages[1]?.status).toBe('translated');

    // Saved again as it is now: nothing to write. With a status file it can't read: still saved.
    await writeFile(join(folder, '.paperl10n/status/he.json'), 'not json');
    const again = await api.saveCatalog({
      projectId,
      catalog: 'i18n',
      messages: [
        {
          key: 'example-count',
          text: 'יש {{PLURAL:$1|דוגמה אחת|$1 דוגמאות}}.',
          base: 'יש {{PLURAL:$1|דוגמה אחת|$1 דוגמאות}}.',
          source: 'There {{PLURAL:$1|is one example|are $1 examples}}.',
        },
      ],
    });
    expect(again.ok && again.value.written).toBe(false);
    expect(again.ok && again.value.statusProblem?.code).toBe('workspace.status-invalid');

    // The same message again, from the old base: it changed on disk since, so nothing is written.
    expect(
      await api.saveCatalog({
        projectId,
        catalog: 'i18n',
        messages: [{ key: 'example-count', text: 'אחר', base: null, source: 'x' }],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: 'workspace.catalog-changed',
        params: { file: 'i18n/he.json' },
        details: ['example-count'],
      },
    });
  },
  saveCatalogDraft: async () => {
    const folder = await copyOfExtension();
    const drafts = await draftsFolder();
    const first = rendererApi(folder, drafts).api;
    const opened = await first.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const count = {
      key: 'example-count',
      text: 'יש {{PLURAL:$1|דוגמה|$1 דוגמאות}}.',
      base: null,
      source: 'There {{PLURAL:$1|is one example|are $1 examples}}.',
    };
    // A message set to what the file says is no edit: it's dropped when the catalog is read.
    const last = {
      key: 'example-last',
      text: 'הודעה אחרונה',
      base: 'הודעה אחרונה',
      source: 'Last message',
    };
    expect(
      await first.saveCatalogDraft({
        projectId: opened.value.projectId,
        catalog: 'i18n',
        messages: [count, last],
      }),
    ).toEqual({ ok: true, value: null });

    // After a restart: the catalog lists with a draft, and reads with its real edits.
    const { api } = rendererApi(folder, drafts);
    const again = await api.openProject();
    if (!again.ok || again.value === null) throw new Error(JSON.stringify(again));
    const { projectId } = again.value;
    const listed = await api.listCatalogs({ projectId });
    expect(listed.ok && listed.value.catalogs.map((c) => [c.key, c.hasDraft])).toEqual([
      ['i18n', true],
      ['i18n/api', false],
    ]);
    const read = await api.readCatalog({ projectId, key: 'i18n' });
    expect(read.ok && read.value.draft).toEqual({ messages: [count] });

    // Saving the message forgets it from the draft, and so the draft.
    await api.saveCatalog({ projectId, catalog: 'i18n', messages: [count] });
    const saved = await api.readCatalog({ projectId, key: 'i18n' });
    expect(saved.ok && saved.value.draft).toBeNull();
  },
  discardCatalogDraft: async () => {
    const folder = await copyOfExtension();
    const { api } = rendererApi(folder, await draftsFolder());
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId } = opened.value;
    const edit = { key: 'example-count', text: 'יש', base: null, source: 'There' };
    await api.saveCatalogDraft({ projectId, catalog: 'i18n', messages: [edit] });
    expect(await api.discardCatalogDraft({ projectId, catalog: 'i18n' })).toEqual({
      ok: true,
      value: null,
    });
    const read = await api.readCatalog({ projectId, key: 'i18n' });
    expect(read.ok && read.value.draft).toBeNull();
    expect(
      await api.saveCatalogDraft({ projectId: 'nope', catalog: 'i18n', messages: [edit] }),
    ).toEqual({ ok: false, error: { code: 'workspace.unknown-project', params: {}, details: [] } });
    expect(await api.discardCatalogDraft({ projectId, catalog: '' })).toMatchObject({
      ok: false,
      error: { code: 'internal.invalid-request' },
    });
  },
  keepMessagesUpToDate: async () => {
    const folder = await copyOfExtension();
    const { api } = rendererApi(folder);
    const opened = await api.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId } = opened.value;
    const kept = await api.keepMessagesUpToDate({
      projectId,
      catalog: 'i18n',
      messages: [{ key: 'example-last', source: 'Last message' }],
    });
    expect(kept).toEqual({ ok: true, value: [{ key: 'example-last', status: 'translated' }] });
    const status = JSON.parse(
      await readFile(join(folder, '.paperl10n/status/he.json'), 'utf8'),
    ) as { catalogs: Record<string, Record<string, string>> };
    expect(status.catalogs.i18n?.['example-last']).toBe(messageFingerprint('Last message'));
    expect(
      await api.keepMessagesUpToDate({
        projectId,
        catalog: 'i18n',
        messages: [{ key: 'example-last', source: 'Not what it says' }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'workspace.source-changed' } });
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
      value: { marked: ['index'], markedMessages: 0 },
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

    // A catalog's translated messages are recorded too (in a copy never recorded).
    const copy = await copyOfExtension();
    await rm(join(copy, '.paperl10n'), { recursive: true });
    const extension = rendererApi(copy).api;
    const opened = await extension.openProject();
    if (!opened.ok || opened.value === null) throw new Error(JSON.stringify(opened));
    const { projectId: catalogProject } = opened.value;
    /** Each catalog's messages with the status. */
    const counted = async (status: 'draft' | 'translated') => {
      const result = await extension.listCatalogs({ projectId: catalogProject });
      return result.ok ? result.value.catalogs.map((c) => c.progress?.byStatus[status]) : result;
    };
    expect(await counted('draft')).toEqual([3, 0]);
    expect(await extension.markExistingUpToDate({ projectId: catalogProject })).toEqual({
      ok: true,
      value: { marked: [], markedMessages: 3 },
    });
    expect(await counted('translated')).toEqual([3, 0]);
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

  it('reads, checks, saves, and keeps a gettext catalog’s plural forms and review marks', async () => {
    const folder = await copyOfGettext();
    const { api, rejections } = rendererApi(folder);
    const projectId = await openBasic(api);
    const read = await api.readCatalog({ projectId, key: 'lantern' });
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.value.pluralForms).toEqual([
      { samples: [1] },
      { samples: [2] },
      { samples: [0, 3, 4, 5] },
    ]);
    const [title, , , , lamps] = read.value.messages;
    expect(title).toMatchObject({
      key: 'Lantern',
      documentation: "The window's title.",
      needsReview: true,
      previousSource: 'Lanterns',
      status: 'outdated',
    });
    expect(lamps?.sourceForms?.map((form) => form.text)).toEqual([
      '%d lamp is lit',
      '%d lamps are lit',
    ]);
    expect(lamps?.translationForms?.[2]).toEqual({
      text: '%d מנורות דולקות',
      tokens: [{ kind: 'parameter', start: 0, end: 2 }],
    });

    const checked = await api.checkMessage({
      projectId,
      catalog: 'lantern',
      key: '%d lamp is lit',
      text: 'מנורה',
      forms: ['מנורה', 'שתיים', 'הרבה'],
    });
    expect(checked.ok && checked.value.forms?.map((form) => form.warnings)).toEqual([
      [],
      [],
      [{ kind: 'missing', token: 'parameter', value: '%d' }],
    ]);

    const po = join(folder, 'po/he.po');
    const before = await readFile(po, 'utf8');
    const saved = await api.saveCatalog({
      projectId,
      catalog: 'lantern',
      messages: [
        {
          key: '%d lamp is lit',
          text: 'מנורה אחת דולקת',
          forms: ['מנורה אחת דולקת', 'שתי מנורות דולקות', 'דולקות %d מנורות'],
          base: 'מנורה אחת דולקת',
          baseForms: ['מנורה אחת דולקת', 'שתי מנורות דולקות', '%d מנורות דולקות'],
          source: '%d lamp is lit',
        },
      ],
    });
    expect(saved.ok && saved.value.messages).toEqual([
      { key: '%d lamp is lit', status: 'translated' },
    ]);
    expect(await readFile(po, 'utf8')).toBe(
      before.replace('msgstr[2] "%d מנורות דולקות"', 'msgstr[2] "דולקות %d מנורות"'),
    );

    const kept = await api.keepMessagesUpToDate({
      projectId,
      catalog: 'lantern',
      messages: [{ key: 'Lantern', source: 'Lantern' }],
    });
    expect(kept).toEqual({ ok: true, value: [{ key: 'Lantern', status: 'translated' }] });
    expect(await readFile(po, 'utf8')).toBe(
      before
        .replace('msgstr[2] "%d מנורות דולקות"', 'msgstr[2] "דולקות %d מנורות"')
        .replace('#, fuzzy\n#| msgid "Lanterns"\n', ''),
    );
    expect(rejections).toEqual([]);
  });
});
