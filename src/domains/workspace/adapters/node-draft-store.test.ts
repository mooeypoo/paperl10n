// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeDraftStoreContract } from '../testing/draft-store-contract.ts';
import { nodeDraftStore } from './node-draft-store.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    chmodSync(folder, 0o700);
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A temporary app-data folder; the drafts folder inside it doesn't exist yet. */
function appData(): string {
  const folder = mkdtempSync(join(tmpdir(), 'paperl10n-drafts-'));
  folders.push(folder);
  return folder;
}

describeDraftStoreContract('nodeDraftStore', () =>
  Promise.resolve(nodeDraftStore(join(appData(), 'drafts'))),
);

const key = { project: '/home/me/docs', locale: 'he', document: 'index' };

describe('nodeDraftStore', () => {
  it('creates its folder on the first write, readable only by the user, and leaves no temp files', async () => {
    const drafts = join(appData(), 'drafts');
    const store = nodeDraftStore(drafts);
    await store.put(key, { text: 'x', base: null });
    expect(statSync(drafts).mode & 0o777).toBe(0o700);
    const names = readdirSync(drafts);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^[0-9a-f]{64}\.json$/);
    expect(statSync(join(drafts, names[0] ?? '')).mode & 0o777).toBe(0o600);
  });

  it('treats a corrupt file, another version, or a file for another key as no draft', async () => {
    const drafts = join(appData(), 'drafts');
    const store = nodeDraftStore(drafts);
    await store.put(key, { text: 'x', base: null });
    const [name = ''] = readdirSync(drafts);
    const file = join(drafts, name);
    for (const contents of [
      '{ not json',
      JSON.stringify({ format: 'paperl10n-draft', version: 2, ...key, text: 'x', base: null }),
      JSON.stringify({ format: 'paperl10n-draft', version: 1, ...key, text: 7, base: null }),
      // The right file name holding another key's draft (a collision, or a copied file).
      JSON.stringify({
        format: 'paperl10n-draft',
        version: 1,
        ...key,
        document: 'other',
        text: 'x',
        base: null,
      }),
    ]) {
      writeFileSync(file, contents);
      expect(await store.get(key)).toEqual({ ok: true, value: null });
    }
    expect(await store.documents(key.project, key.locale)).toEqual({ ok: true, value: [] });
  });

  it("ignores files in its folder that aren't drafts", async () => {
    const drafts = join(appData(), 'drafts');
    const store = nodeDraftStore(drafts);
    await store.put(key, { text: 'x', base: null });
    writeFileSync(join(drafts, 'notes.txt'), 'hello');
    expect(await store.documents(key.project, key.locale)).toEqual({ ok: true, value: ['index'] });
  });

  it('reports a folder it cannot use as unavailable', async () => {
    const data = appData();
    const drafts = join(data, 'drafts');
    // A file where the folder should be.
    writeFileSync(drafts, '');
    const store = nodeDraftStore(drafts);
    const unavailable = { ok: false, error: { code: 'drafts.unavailable' } };
    expect(await store.put(key, { text: 'x', base: null })).toEqual(unavailable);
    expect(await store.documents(key.project, key.locale)).toEqual(unavailable);
    expect(await store.get(key)).toEqual(unavailable);
    expect(await store.remove(key)).toEqual(unavailable);
  });
});
