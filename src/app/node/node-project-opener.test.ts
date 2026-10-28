// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeProjectFilesOpenerContract } from '#domain-testing/workspace';
import { nodeProjectOpener } from './node-project-opener.ts';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('nodeProjectOpener', () => {
  it('opens a folder and names the project after it', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'paperl10n-opener-'));
    roots.push(parent);
    const opened = await nodeProjectOpener.open(parent);
    expect(opened.ok && opened.value.name).toBe(parent.split('/').at(-1));
  });

  it.each<[string, (parent: string) => Promise<string>, string]>([
    ['a missing folder', (parent) => Promise.resolve(join(parent, 'nope')), 'not-found'],
    [
      'a file',
      async (parent) => {
        await writeFile(join(parent, 'file.md'), 'x');
        return join(parent, 'file.md');
      },
      'not-a-folder',
    ],
  ])('reports %s', async (_description, make, reason) => {
    const parent = await mkdtemp(join(tmpdir(), 'paperl10n-opener-'));
    roots.push(parent);
    expect(await nodeProjectOpener.open(await make(parent))).toEqual({
      ok: false,
      error: { code: 'workspace.folder-unavailable', reason },
    });
  });
});

describeProjectFilesOpenerContract('nodeProjectOpener', async (tree, folderName) => {
  const parent = await mkdtemp(join(tmpdir(), 'paperl10n-opener-'));
  roots.push(parent);
  const folder = join(parent, folderName);
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), content);
  }
  return { opener: nodeProjectOpener, folder, missing: join(parent, 'nope') };
});
