// SPDX-License-Identifier: GPL-3.0-or-later
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FileTree } from '#domain-testing/formats';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { describeProjectWriterContract } from '../testing/project-writer-contract.ts';
import { nodeProjectWriter } from './node-project-writer.ts';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function folderWith(tree: FileTree): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'paperl10n-writer-'));
  roots.push(root);
  for (const [path, content] of Object.entries(tree)) {
    const absolute = join(root, ...path.split('/'));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

/** Every file under `root`, by project path. */
async function contentsOf(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    files[
      absolute
        .slice(root.length + 1)
        .split(sep)
        .join('/')
    ] = await readFile(absolute, 'utf8');
  }
  return files;
}

function p(raw: string): ProjectPath {
  const path = projectPath(raw);
  if (!path.ok) throw new Error(`test setup: invalid path ${raw}`);
  return path.value;
}

describeProjectWriterContract('nodeProjectWriter', async (tree) => {
  const root = await folderWith(tree);
  return { writer: nodeProjectWriter(root), contents: () => contentsOf(root) };
});

describe('nodeProjectWriter', () => {
  it('keeps the permissions of the file it replaces', async () => {
    const root = await folderWith({ 'a.json': '{}' });
    await chmod(join(root, 'a.json'), 0o640);
    await nodeProjectWriter(root).writeText(p('a.json'), '{ "b": 1 }');
    expect((await stat(join(root, 'a.json'))).mode & 0o777).toBe(0o640);
  });

  it('writes through a symlink to a file inside the project, keeping the link', async () => {
    const root = await folderWith({ 'real/config.json': '{}' });
    await symlink(join(root, 'real/config.json'), join(root, 'link.json'));
    expect((await nodeProjectWriter(root).writeText(p('link.json'), 'new')).ok).toBe(true);
    expect(await readFile(join(root, 'real/config.json'), 'utf8')).toBe('new');
    expect((await lstat(join(root, 'link.json'))).isSymbolicLink()).toBe(true);
  });

  it.each<[string, (root: string, outside: string) => Promise<void>]>([
    [
      'a symlinked file',
      (root, outside) => symlink(join(outside, 'secret.json'), join(root, 'a.json')),
    ],
    ['a file in a symlinked folder', (root, outside) => symlink(outside, join(root, 'out'))],
  ])('refuses to write outside the project through %s', async (_description, link) => {
    const root = await folderWith({});
    const outside = await folderWith({ 'secret.json': 'secret' });
    await link(root, outside);
    const path = (await readdir(root)).includes('out') ? 'out/secret.json' : 'a.json';
    expect(await nodeProjectWriter(root).writeText(p(path), 'x')).toEqual({
      ok: false,
      error: { code: 'files.outside-project', path },
    });
    expect(await readFile(join(outside, 'secret.json'), 'utf8')).toBe('secret');
  });

  it('reports a folder it may not write to, and leaves nothing behind', async () => {
    const root = await folderWith({ 'locked/a.json': '{}' });
    await chmod(join(root, 'locked'), 0o555);
    try {
      const result = await nodeProjectWriter(root).writeText(p('locked/a.json'), 'x');
      // Root ignores permissions; the check only means something for a normal user.
      if (process.getuid?.() === 0) return;
      expect(result).toEqual({
        ok: false,
        error: { code: 'files.unwritable', path: 'locked/a.json' },
      });
      expect(await readdir(join(root, 'locked'))).toEqual(['a.json']);
      expect(await readFile(join(root, 'locked/a.json'), 'utf8')).toBe('{}');
    } finally {
      await chmod(join(root, 'locked'), 0o755);
    }
  });
});
