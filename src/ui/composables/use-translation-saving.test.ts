// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import { error, fakeClient, pairFor } from '../test-support';
import { useTranslationSaving } from './use-translation-saving';

/** A snapshot that records whether it was marked saved. */
function snapshot(text: string) {
  const marks: string[] = [];
  return { text, markSaved: () => marks.push(text), marks };
}

function setup(client: PaperLionApi, pair: DocumentPairDto | null) {
  const current = shallowRef(pair);
  const saved: string[] = [];
  const draftChanges: string[] = [];
  // What the editor holds; `null` means there's no editor.
  const editor = { text: null as string | null };
  const saving = useTranslationSaving(client, ref('p-1'), current, {
    currentSnapshot: () => (editor.text === null ? null : snapshot(editor.text)),
    onDraftChange: (key, hasDraft) => draftChanges.push(`${key}:${String(hasDraft)}`),
    onSaved: (key) => saved.push(key),
    draftDelay: 500,
  });
  return { saving, current, saved, draftChanges, editor };
}

describe('useTranslationSaving', () => {
  it('saves against the file as read, then against the last save', async () => {
    const { client, calls } = fakeClient();
    const { saving, saved } = setup(client, pairFor('index', 'Home\n', 'בית\r\n'));
    const first = snapshot('בית!\r\n');
    expect(await saving.save(first)).toBe(true);
    expect(await saving.save(snapshot('בית!!\r\n'))).toBe(true);
    expect(calls).toEqual([
      'saveDocument:p-1:index:"בית!\\r\\n":"בית\\r\\n"',
      'saveDocument:p-1:index:"בית!!\\r\\n":"בית!\\r\\n"',
    ]);
    expect(first.marks).toEqual(['בית!\r\n']);
    expect(saved).toEqual(['index', 'index']);
  });

  it('saves a new translation as new (no base), then against what it saved', async () => {
    const { client, calls } = fakeClient();
    const { saving } = setup(client, pairFor('guide/intro', 'Intro\n'));
    saving.start();
    expect([saving.started.value, saving.isNew.value]).toEqual([true, true]);
    await saving.save(snapshot('מבוא\n'));
    expect(saving.isNew.value).toBe(false);
    await saving.save(snapshot('מבוא!\n'));
    expect(calls).toEqual([
      'saveDocument:p-1:guide/intro:"מבוא\\n":new',
      'saveDocument:p-1:guide/intro:"מבוא!\\n":"מבוא\\n"',
    ]);
  });

  it('says unsaved, saving, then saved; and unsaved again after the next edit', async () => {
    const { client } = fakeClient();
    const { saving } = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    expect(saving.status.value).toBe('clean');
    saving.setDirty(true);
    expect(saving.status.value).toBe('unsaved');
    const pending = saving.save(snapshot('x'));
    expect(saving.status.value).toBe('saving');
    await pending;
    // The editor reports clean once the snapshot is marked saved.
    saving.setDirty(false);
    expect(saving.status.value).toBe('saved');
    saving.setDirty(true);
    expect(saving.status.value).toBe('unsaved');
  });

  it('keeps a failure, marks nothing saved, and keeps the base for the next try', async () => {
    const failure = error('workspace.document-changed', { file: 'he/index.md' });
    const { client, calls } = fakeClient({ save: { ok: false, error: failure } });
    const { saving, saved } = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    const attempt = snapshot('x');
    expect(await saving.save(attempt)).toBe(false);
    expect(saving.error.value).toEqual(failure);
    expect(attempt.marks).toEqual([]);
    expect(saved).toEqual([]);
    await saving.save(snapshot('y'));
    expect(calls.at(-1)).toBe('saveDocument:p-1:index:"y":"בית\\n"');
  });

  it('reports a broken transport as internal.unexpected', async () => {
    const client: PaperLionApi = {
      ...fakeClient().client,
      saveDocument: () => Promise.reject(new Error('channel closed')),
    };
    const { saving } = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    expect(await saving.save(snapshot('x'))).toBe(false);
    expect(saving.error.value?.code).toBe('internal.unexpected');
    expect(saving.status.value).not.toBe('saving');
  });

  it('starts over for another page', async () => {
    const failure = error('workspace.document-changed', { file: 'he/index.md' });
    const { client, calls } = fakeClient({ save: { ok: false, error: failure } });
    const { saving, current } = setup(client, pairFor('index', 'Home\n'));
    saving.start();
    saving.setDirty(true);
    await saving.save(snapshot('x'));
    current.value = pairFor('other', 'Other\n', 'אחר\n');
    await nextTick();
    expect([saving.started.value, saving.dirty.value, saving.error.value]).toEqual([
      false,
      false,
      null,
    ]);
    await saving.save(snapshot('y'));
    expect(calls.at(-1)).toBe('saveDocument:p-1:other:"y":"אחר\\n"');
  });

  it("leaves another page's state alone when a slow save answers after a page change", async () => {
    let answer: (value: Result<{ path: string; written: boolean }, ErrorDto>) => void = () =>
      undefined;
    const client: PaperLionApi = {
      ...fakeClient().client,
      saveDocument: () => new Promise((resolve) => (answer = resolve)),
    };
    const { saving, current, saved } = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    const slow = snapshot('x');
    const pending = saving.save(slow);
    current.value = pairFor('other', 'Other\n', 'אחר\n');
    await nextTick();
    saving.setDirty(true);
    answer({ ok: true, value: { path: 'he/index.md', written: true } });
    await pending;
    await flushPromises();
    expect(slow.marks).toEqual([]);
    expect(saved).toEqual([]);
    expect(saving.status.value).toBe('unsaved');
  });

  it('saves one snapshot at a time, and nothing without a page', async () => {
    const { client, calls } = fakeClient();
    const { saving, current } = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    const first = saving.save(snapshot('a'));
    expect(await saving.save(snapshot('b'))).toBe(false);
    await first;
    current.value = null;
    await nextTick();
    expect(await saving.save(snapshot('c'))).toBe(false);
    expect(calls).toEqual(['saveDocument:p-1:index:"a":"בית\\n"']);
  });
});

describe('useTranslationSaving: drafts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Types: the editor's text changes and it reports unsaved. */
  function typeInto(app: ReturnType<typeof setup>, text: string) {
    app.editor.text = text;
    app.saving.setDirty(true);
    app.saving.noteEdit();
  }

  it('keeps the unsaved text as a draft once typing pauses, once per pause', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const app = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    typeInto(app, 'ב');
    await vi.advanceTimersByTimeAsync(300);
    typeInto(app, 'בי');
    await vi.advanceTimersByTimeAsync(499);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['saveDraft:p-1:index:"בי":"בית\\n"']);
    expect(app.draftChanges).toEqual(['index:true']);
    typeInto(app, 'בית!');
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.at(-1)).toBe('saveDraft:p-1:index:"בית!":"בית\\n"');
    // The page was already marked as drafted.
    expect(app.draftChanges).toEqual(['index:true']);
  });

  it('forgets the draft when edits are undone back to the file', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const app = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    typeInto(app, 'x');
    await vi.advanceTimersByTimeAsync(500);
    app.editor.text = 'בית\n';
    app.saving.setDirty(false);
    app.saving.noteEdit();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.at(-1)).toBe('discardDraft:p-1:index');
    expect(app.draftChanges).toEqual(['index:true', 'index:false']);
  });

  it('sends nothing for clean edits when no draft was kept', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const app = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    app.saving.noteEdit();
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toEqual([]);
  });

  it('cancels a pending draft when another page opens', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const app = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    typeInto(app, 'x');
    app.current.value = pairFor('other', 'Other\n');
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual([]);
  });

  it('keeps text typed during a save as a draft, against the saved text', async () => {
    vi.useFakeTimers();
    let finishSave: (value: Result<{ path: string; written: boolean }, ErrorDto>) => void = () =>
      undefined;
    const { client, calls } = fakeClient();
    const app = setup(
      {
        ...client,
        saveDocument: (request) => {
          void client.saveDocument(request);
          return new Promise((resolve) => (finishSave = resolve));
        },
      },
      pairFor('index', 'Home\n', 'בית\n'),
    );
    typeInto(app, 'x');
    const saved = app.saving.save(snapshot('x'));
    typeInto(app, 'xy');
    finishSave({ ok: true, value: { path: 'he/index.md', written: true } });
    await saved;
    await vi.advanceTimersByTimeAsync(500);
    expect(calls.at(-1)).toBe('saveDraft:p-1:index:"xy":"x"');
    expect(app.draftChanges).toEqual(['index:true']);
  });

  it('shows a failure to keep the draft, and clears it once keeping works', async () => {
    vi.useFakeTimers();
    const failure = error('workspace.draft-unwritable');
    const { client } = fakeClient({ saveDraft: { ok: false, error: failure } });
    let fail = true;
    const app = setup(
      {
        ...client,
        saveDraft: (request) =>
          fail ? client.saveDraft(request) : Promise.resolve({ ok: true, value: null }),
      },
      pairFor('index', 'Home\n', 'בית\n'),
    );
    typeInto(app, 'x');
    await vi.advanceTimersByTimeAsync(500);
    expect(app.saving.draftError.value).toEqual(failure);
    expect(app.draftChanges).toEqual([]);
    fail = false;
    typeInto(app, 'xy');
    await vi.advanceTimersByTimeAsync(500);
    expect(app.saving.draftError.value).toBeNull();
    expect(app.draftChanges).toEqual(['index:true']);
  });

  it('restores a draft: its base is what saving checks, and saving clears the notice', async () => {
    const { client, calls } = fakeClient();
    const pair = {
      ...pairFor('index', 'Home\n', 'בית חדש\n'),
      draft: { text: 'טיוטה\n', base: 'בית\n' },
    };
    const app = setup(client, pair);
    expect([app.saving.restored.value, app.saving.restoredNotice.value]).toEqual([true, true]);
    await app.saving.save(snapshot('טיוטה\n'));
    // The file changed since the draft's base: main would refuse (here the fake accepts).
    expect(calls).toEqual(['saveDocument:p-1:index:"טיוטה\\n":"בית\\n"']);
    expect([app.saving.restored.value, app.saving.restoredNotice.value]).toEqual([true, false]);
  });

  it('discards a restored draft: back to the file, as its base', async () => {
    const { client, calls } = fakeClient();
    const pair = { ...pairFor('index', 'Home\n', 'בית\n'), draft: { text: 'טיוטה', base: 'old' } };
    const app = setup(client, pair);
    app.saving.setDirty(true);
    await app.saving.discardRestored();
    expect(calls).toEqual(['discardDraft:p-1:index']);
    expect([app.saving.restored.value, app.saving.dirty.value]).toEqual([false, false]);
    expect(app.draftChanges).toEqual(['index:false']);
    await app.saving.save(snapshot('x'));
    expect(calls.at(-1)).toBe('saveDocument:p-1:index:"x":"בית\\n"');
  });

  it('drops the draft when leaving without saving, and only when one may exist', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    const app = setup(client, pairFor('index', 'Home\n', 'בית\n'));
    await app.saving.discardDraft();
    expect(calls).toEqual([]);
    typeInto(app, 'x');
    await vi.advanceTimersByTimeAsync(500);
    typeInto(app, 'xy');
    await app.saving.discardDraft();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toEqual(['saveDraft:p-1:index:"x":"בית\\n"', 'discardDraft:p-1:index']);
  });
});
