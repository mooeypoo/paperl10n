// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentPairDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
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
  const saving = useTranslationSaving(client, ref('p-1'), current, (key) => saved.push(key));
  return { saving, current, saved };
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
