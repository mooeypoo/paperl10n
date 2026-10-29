// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every ProjectFilesOpener implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { FileTree } from '#domain-testing/formats';
import { projectPath } from '#kernel/project-path';
import type { ProjectFilesOpener } from '../application/ports/project-files-opener.ts';

export interface OpenerUnderTest {
  readonly opener: ProjectFilesOpener;
  /** A folder named after `make`'s `folderName` that holds its tree. */
  readonly folder: string;
  /** A folder that doesn't exist. */
  readonly missing: string;
}

/** `make(tree, folderName)` sets up an opener that can open a folder with that name and files. */
export function describeProjectFilesOpenerContract(
  name: string,
  make: (tree: FileTree, folderName: string) => Promise<OpenerUnderTest>,
): void {
  describe(`ProjectFilesOpener contract: ${name}`, () => {
    const tree = { 'paperl10n.config.json': '{}', 'en/index.md': '# Hello\n' };

    it("opens a folder as its files, named after the folder's last segment", async () => {
      const { opener, folder } = await make(tree, 'my-docs');
      const opened = await opener.open(folder);
      if (!opened.ok) throw new Error(`expected the folder to open: ${JSON.stringify(opened)}`);
      expect(opened.value.name).toBe('my-docs');
      const root = projectPath('');
      const index = projectPath('en/index.md');
      if (!root.ok || !index.ok) throw new Error('test setup: invalid paths');
      expect(await opened.value.files.list(root.value)).toEqual({
        ok: true,
        value: ['en/index.md', 'paperl10n.config.json'],
      });
      expect(await opened.value.files.readText(index.value)).toEqual({
        ok: true,
        value: '# Hello\n',
      });
    });

    it('writes into the opened folder, and its files see the change', async () => {
      const { opener, folder } = await make(tree, 'my-docs');
      const opened = await opener.open(folder);
      if (!opened.ok) throw new Error(`expected the folder to open: ${JSON.stringify(opened)}`);
      const config = projectPath('paperl10n.config.json');
      if (!config.ok) throw new Error('test setup: invalid path');
      expect((await opened.value.writer.writeText(config.value, '{ "a": 1 }')).ok).toBe(true);
      expect(await opened.value.files.readText(config.value)).toEqual({
        ok: true,
        value: '{ "a": 1 }',
      });
    });

    it('reports a missing folder as unavailable (not found)', async () => {
      const { opener, missing } = await make(tree, 'my-docs');
      expect(await opener.open(missing)).toEqual({
        ok: false,
        error: { code: 'workspace.folder-unavailable', reason: 'not-found' },
      });
    });
  });
}
