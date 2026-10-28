// SPDX-License-Identifier: GPL-3.0-or-later
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROJECT_ROOT, projectPath, type ProjectPath } from '#kernel/project-path';
import type { ProjectFiles } from '../application/ports/project-files.ts';
import type { FileTree } from './in-memory-project-files.ts';
import { describeProjectFilesContract } from '../testing/project-files-contract.ts';
import { openNodeProjectFiles } from './node-project-files.ts';

const temporaryRoots: string[] = [];
afterAll(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryFolder(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'paperl10n-files-'));
  temporaryRoots.push(root);
  return root;
}

async function writeTree(root: string, tree: FileTree): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    const absolute = join(root, ...path.split('/'));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

async function open(root: string): Promise<ProjectFiles> {
  const files = await openNodeProjectFiles(root);
  if (!files.ok) throw new Error(`test setup: ${files.error.code}`);
  return files.value;
}

function p(raw: string): ProjectPath {
  const path = projectPath(raw);
  if (!path.ok) throw new Error(`test setup: invalid path ${raw}`);
  return path.value;
}

describeProjectFilesContract('NodeProjectFiles', async (tree) => {
  const root = await temporaryFolder();
  await writeTree(root, tree);
  return open(root);
});

describe('NodeProjectFiles with the committed fixture', () => {
  const fixture = new URL('../../../../tests/fixtures/project-files', import.meta.url).pathname;

  it('reads a BOM and CRLF line endings exactly as committed (.gitattributes keeps them)', async () => {
    const files = await open(fixture);
    expect(await files.readText(p('docs/index.md'))).toEqual({
      ok: true,
      value: '﻿# Home\r\n\r\nWindows line endings and a BOM.\r\n',
    });
  });

  it('lists the fixture, including non-ASCII file names, without node_modules', async () => {
    const files = await open(fixture);
    expect(await files.list(PROJECT_ROOT)).toEqual({
      ok: true,
      value: [
        '.vitepress/config.mjs',
        'README.md',
        'docs/guide/intro.md',
        'docs/guide/notes.txt',
        'docs/he/מדריך.md',
        'docs/index.md',
      ],
    });
    expect(await files.readText(p('docs/he/מדריך.md'))).toEqual({
      ok: true,
      value: '# מדריך\n\nטקסט בעברית.\n',
    });
  });
});

describe('NodeProjectFiles and symlinks', () => {
  let project: string;
  let outside: string;

  beforeAll(async () => {
    outside = await temporaryFolder();
    await writeTree(outside, { 'secret.md': 'outside the project\n', 'dir/x.md': 'x\n' });
    project = await temporaryFolder();
    await writeTree(project, { 'docs/real.md': 'real\n', 'docs/sub/a.md': 'a\n' });
    await symlink(join(project, 'docs/real.md'), join(project, 'docs/alias.md'));
    await symlink(join(outside, 'secret.md'), join(project, 'docs/escape.md'));
    await symlink(join(outside, 'dir'), join(project, 'docs/escape-dir'));
    await symlink(join(project, 'docs/sub'), join(project, 'docs/linked-dir'));
    await symlink(join(project, 'docs/missing.md'), join(project, 'docs/dangling.md'));
  });

  it('lists links to files inside the project, and nothing that escapes or loops', async () => {
    const files = await open(project);
    expect(await files.list(p('docs'))).toEqual({
      ok: true,
      value: ['docs/alias.md', 'docs/real.md', 'docs/sub/a.md'],
    });
  });

  it('reads through a link that stays inside the project', async () => {
    const files = await open(project);
    expect(await files.readText(p('docs/alias.md'))).toEqual({ ok: true, value: 'real\n' });
  });

  it('refuses links that point outside the project', async () => {
    const files = await open(project);
    expect(await files.readText(p('docs/escape.md'))).toEqual({
      ok: false,
      error: { code: 'files.outside-project', path: 'docs/escape.md' },
    });
    expect(await files.list(p('docs/escape-dir'))).toEqual({
      ok: false,
      error: { code: 'files.outside-project', path: 'docs/escape-dir' },
    });
    expect(await files.exists(p('docs/escape.md'))).toBe(false);
  });

  it('treats a dangling link as missing', async () => {
    const files = await open(project);
    expect(await files.readText(p('docs/dangling.md'))).toEqual({
      ok: false,
      error: { code: 'files.not-found', path: 'docs/dangling.md' },
    });
  });

  it('works when the project root itself is reached through a symlink', async () => {
    const linkToProject = join(await temporaryFolder(), 'project-link');
    await symlink(project, linkToProject);
    const files = await open(linkToProject);
    expect(await files.readText(p('docs/real.md'))).toEqual({ ok: true, value: 'real\n' });
  });
});

describe('openNodeProjectFiles', () => {
  it('reports a missing root', async () => {
    const root = join(await temporaryFolder(), 'nope');
    expect(await openNodeProjectFiles(root)).toEqual({
      ok: false,
      error: { code: 'files.root-not-found', root },
    });
  });

  it('reports a root that is a file', async () => {
    const folder = await temporaryFolder();
    const root = join(folder, 'file.md');
    await writeFile(root, 'x');
    expect(await openNodeProjectFiles(root)).toEqual({
      ok: false,
      error: { code: 'files.root-not-a-directory', root },
    });
  });
});

// Permission checks are meaningless when running as root, which ignores file modes.
const runningAsRoot = process.getuid?.() === 0;

describe.skipIf(runningAsRoot)('NodeProjectFiles and permissions', () => {
  it('reports an unreadable file and an unreadable folder', async () => {
    const root = await temporaryFolder();
    await writeTree(root, { 'locked.md': 'x', 'closed/inner.md': 'y' });
    await chmod(join(root, 'locked.md'), 0o000);
    await chmod(join(root, 'closed'), 0o000);
    const files = await open(root);
    try {
      expect(await files.readText(p('locked.md'))).toEqual({
        ok: false,
        error: { code: 'files.unreadable', path: 'locked.md' },
      });
      expect(await files.list(p('closed'))).toEqual({
        ok: false,
        error: { code: 'files.unreadable', path: 'closed' },
      });
    } finally {
      await chmod(join(root, 'closed'), 0o755);
    }
  });
});
