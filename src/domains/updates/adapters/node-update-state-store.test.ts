// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeUpdateStateStoreContract } from '#domain-testing/updates';
import { nodeUpdateStateStore } from './node-update-state-store.ts';

const scratch = () => mkdtemp(join(tmpdir(), 'paperl10n-updates-'));

describeUpdateStateStoreContract('nodeUpdateStateStore', async () =>
  nodeUpdateStateStore(join(await scratch(), 'data', 'updates.json')),
);

describe('nodeUpdateStateStore', () => {
  it('creates its folder, keeps the file private, and leaves no temporary file', async () => {
    const folder = join(await scratch(), 'data');
    const store = nodeUpdateStateStore(join(folder, 'updates.json'));
    await store.write('{}\n');
    expect(await readdir(folder)).toEqual(['updates.json']);
    if (process.platform !== 'win32') {
      expect((await stat(join(folder, 'updates.json'))).mode & 0o777).toBe(0o600);
    }
  });

  it('fails to write where it cannot, and reads nothing from a folder', async () => {
    const folder = await scratch();
    const blocker = join(folder, 'not-a-folder');
    await writeFile(blocker, 'x');
    const store = nodeUpdateStateStore(join(blocker, `${randomUUID()}.json`));
    expect(await store.write('{}')).toEqual({ ok: false, error: 'unwritable' });
    expect(await nodeUpdateStateStore(folder).read()).toBeNull();
  });
});
