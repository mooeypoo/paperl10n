// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFormatRegistry } from '#domains/formats';
import { detects, fakeCatalogPlugin, type FileTree } from '#domain-testing/formats';
import type { ProjectPath } from '#kernel/project-path';
import { InMemoryDraftStore } from '../adapters/in-memory-draft-store.ts';
import { InMemoryProjectSessions } from '../adapters/in-memory-project-sessions.ts';
import {
  FakeFolderPicker,
  FakeProjectFilesOpener,
  unavailableDraftStore,
} from '../testing/fakes.ts';
import { createDiscardCatalogDraft, createSaveCatalogDraft } from './catalog-drafts.ts';
import { createListCatalogs } from './list-catalogs.ts';
import { createOpenProject } from './open-project.ts';
import type { DraftStore } from './ports/draft-store.ts';
import { createReadCatalog } from './read-catalog.ts';
import { createSaveCatalog, type MessageSave } from './save-catalog.ts';
import { createStatusUpdates } from './translation-status.ts';

const TARGET = 'i18n/he.cat' as ProjectPath;
const config = (settings: object = { targetLocale: 'he' }) =>
  JSON.stringify({ sourceLocale: 'en', ...settings });
const tree: FileTree = {
  'paperl10n.config.json': config(),
  'i18n/en.cat': 'a=Hello\nb=Bye\n',
  [TARGET]: 'a=שלום\n',
  'api/en.cat': 'x=X\n',
};
const edit = (key: string, text: string, base: string | null, source: string | null) => ({
  key,
  text,
  base,
  source,
});
const bye = edit('b', 'ביי', null, 'Bye');
const hello = edit('a', 'שלום רב', 'שלום', 'Hello');

async function open(files: FileTree = tree, catalogDrafts: DraftStore = new InMemoryDraftStore()) {
  const registry = createFormatRegistry([fakeCatalogPlugin('catalog-fake', detects('likely'))], {
    apiVersion: 4,
  });
  if (!registry.ok) throw new Error('test setup');
  const sessions = new InMemoryProjectSessions(randomUUID);
  const opened = await createOpenProject({
    folderPicker: new FakeFolderPicker('/p'),
    opener: new FakeProjectFilesOpener({ '/p': files }),
    registry: registry.value,
    sessions,
  })();
  if (!opened.ok || opened.value === null) throw new Error(`test setup: ${JSON.stringify(opened)}`);
  const projectId = opened.value.projectId;
  const deps = { sessions, catalogDrafts };
  const read = createReadCatalog(deps);
  const list = createListCatalogs(deps);
  const save = createSaveCatalog({ ...deps, updates: createStatusUpdates() });
  const saveDraft = createSaveCatalogDraft(deps);
  const discard = createDiscardCatalogDraft(deps);
  const key = { project: '/p', locale: 'he', document: 'i18n' };
  return {
    projectId,
    sessions,
    store: catalogDrafts,
    key,
    saveDraft: (messages: MessageSave[], catalog = 'i18n') =>
      saveDraft(projectId, { catalog, messages }),
    discard: (catalog = 'i18n') => discard(projectId, catalog),
    save: (messages: MessageSave[]) => save(projectId, { catalog: 'i18n', messages }),
    /** The catalog's draft as reading it returns it. */
    draft: async (catalog = 'i18n') => {
      const result = await read(projectId, catalog);
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.value.draft;
    },
    hasDraft: async () => {
      const result = await list(projectId);
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return Object.fromEntries(result.value.catalogs.map((c) => [c.key, c.hasDraft]));
    },
  };
}

describe('catalog drafts', () => {
  it('keeps a catalog’s edits, read back with it and listed', async () => {
    const app = await open();
    expect(await app.hasDraft()).toEqual({ api: false, i18n: false });
    expect(await app.saveDraft([bye, hello])).toEqual({ ok: true, value: undefined });
    expect(await app.draft()).toEqual({ messages: [bye, hello] });
    expect(await app.hasDraft()).toEqual({ api: false, i18n: true });
    // Another catalog's draft is its own.
    expect(await app.draft('api')).toBeNull();
  });

  it('replaces the last draft, and forgets it when there are no edits or they’re discarded', async () => {
    const app = await open();
    await app.saveDraft([bye, hello]);
    await app.saveDraft([hello]);
    expect(await app.draft()).toEqual({ messages: [hello] });
    await app.saveDraft([]);
    expect(await app.hasDraft()).toEqual({ api: false, i18n: false });
    expect(await app.draft()).toBeNull();
    await app.saveDraft([hello]);
    expect(await app.discard()).toEqual({ ok: true, value: undefined });
    expect(await app.draft()).toBeNull();
    expect(await app.hasDraft()).toEqual({ api: false, i18n: false });
  });

  it('drops a draft’s messages that say what the file does, and the draft when none is left', async () => {
    const app = await open();
    // `a` set back to the file's text; `b` emptied, as the file has none.
    await app.saveDraft([edit('a', 'שלום', 'שלום', 'Hello'), bye, edit('c', '', null, null)]);
    expect(await app.draft()).toEqual({ messages: [bye] });
    // Forgotten in the store too, not only in the answer.
    const stored = await app.store.get(app.key);
    expect(stored.ok && JSON.parse(stored.value?.text ?? '')).toEqual({ messages: [bye] });

    await app.saveDraft([edit('a', 'שלום', 'שלום', 'Hello')]);
    expect(await app.draft()).toBeNull();
    expect(await app.store.get(app.key)).toEqual({ ok: true, value: null });
  });

  it('forgets saved messages from the draft, keeping the others', async () => {
    const app = await open();
    await app.saveDraft([bye, hello]);
    expect((await app.save([bye])).ok).toBe(true);
    expect(await app.draft()).toEqual({ messages: [hello] });
    // Saved with other text than the draft's: the draft's edit is still unsaved.
    expect((await app.save([edit('a', 'היי', 'שלום', 'Hello')])).ok).toBe(true);
    expect(await app.draft()).toEqual({ messages: [hello] });
    expect((await app.save([edit('a', 'שלום רב', 'היי', 'Hello')])).ok).toBe(true);
    // Forgotten by the save itself, before the catalog is read again.
    expect(await app.hasDraft()).toEqual({ api: false, i18n: false });
    expect(await app.draft()).toBeNull();
  });

  it.each([
    ['not JSON', 'nope'],
    ['no messages', '{}'],
    ['messages not a list', '{"messages":{}}'],
    ['a message that isn’t an object', '{"messages":[1]}'],
    ['a null message', '{"messages":[null]}'],
    ['a list for a message', '{"messages":[["b","x",null,null]]}'],
    ['a message without a source', '{"messages":[{"key":"b","text":"x","base":null}]}'],
    ['a numeric text', '{"messages":[{"key":"b","text":1,"base":null,"source":null}]}'],
    ['a numeric base', '{"messages":[{"key":"b","text":"x","base":1,"source":null}]}'],
    ['a numeric source', '{"messages":[{"key":"b","text":"x","base":null,"source":1}]}'],
    ['a numeric key', '{"messages":[{"key":1,"text":"x","base":null,"source":null}]}'],
    [
      'forms not a list',
      '{"messages":[{"key":"b","text":"x","base":null,"source":null,"forms":"x"}]}',
    ],
    [
      'a numeric form',
      '{"messages":[{"key":"b","text":"x","base":null,"source":null,"forms":[1]}]}',
    ],
    [
      'base forms not a list',
      '{"messages":[{"key":"b","text":"x","base":null,"source":null,"baseForms":"x"}]}',
    ],
  ])('reads a stored draft with %s as none', async (_name, text) => {
    const app = await open();
    await app.store.put(app.key, { text, base: null });
    expect(await app.draft()).toBeNull();
  });

  it('keeps a plural message’s forms, and drops it only when its forms say what the file does', async () => {
    const plural = {
      'paperl10n.config.json': config(),
      'i18n/en.cat': 'n[]=$1 file|$1 files\n',
      [TARGET]: 'n[]=קובץ|$1 קבצים\n',
    };
    const app = await open(plural);
    const sameText = {
      ...edit('n', 'קובץ', 'קובץ', '$1 file'),
      forms: ['קובץ', '$1 קבצים חדשים'],
      baseForms: ['קובץ', '$1 קבצים'],
    };
    expect((await app.saveDraft([sameText])).ok).toBe(true);
    // Its first form says what the file does; the second doesn't: still an edit.
    expect(await app.draft()).toEqual({ messages: [sameText] });
    await app.saveDraft([{ ...sameText, forms: ['קובץ', '$1 קבצים'] }]);
    expect(await app.draft()).toBeNull();
  });

  it('drops a draft with every form empty for a message the file doesn’t have', async () => {
    const app = await open({
      'paperl10n.config.json': config(),
      'i18n/en.cat': 'n[]=$1 file|$1 files\n',
    });
    await app.saveDraft([{ ...edit('n', '', null, '$1 file'), forms: ['', ''], baseForms: null }]);
    expect(await app.draft()).toBeNull();
  });

  it('opens a catalog whose drafts can’t be read, without them', async () => {
    const app = await open(tree, unavailableDraftStore);
    expect(await app.draft()).toBeNull();
    expect(await app.hasDraft()).toEqual({ api: false, i18n: false });
    expect((await app.save([bye])).ok).toBe(true);
  });

  it('reports a draft it can’t keep or forget', async () => {
    const app = await open(tree, unavailableDraftStore);
    expect(await app.saveDraft([bye])).toEqual({
      ok: false,
      error: { code: 'workspace.draft-unwritable' },
    });
    expect(await app.saveDraft([])).toEqual({
      ok: false,
      error: { code: 'workspace.draft-unwritable' },
    });
    expect(await app.discard()).toEqual({
      ok: false,
      error: { code: 'workspace.draft-unwritable' },
    });
  });

  it('reports a malformed catalog key, an unknown project, and no target language', async () => {
    const app = await open();
    expect(await app.saveDraft([bye], '')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: '' },
    });
    expect(await app.discard('')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-catalog', key: '' },
    });
    const deps = { sessions: new InMemoryProjectSessions(randomUUID), catalogDrafts: app.store };
    expect(await createSaveCatalogDraft(deps)('x', { catalog: 'i18n', messages: [] })).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
    expect(await createDiscardCatalogDraft(deps)('x', 'i18n')).toEqual({
      ok: false,
      error: { code: 'workspace.unknown-project' },
    });
    const untargeted = await open({ ...tree, 'paperl10n.config.json': config({}) });
    expect(await untargeted.saveDraft([bye])).toEqual({
      ok: false,
      error: { code: 'workspace.no-target-locale' },
    });
  });
});
