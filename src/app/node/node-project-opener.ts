// SPDX-License-Identifier: GPL-3.0-or-later
import { realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ProjectFilesOpener } from '#domains/workspace';
import { err, ok } from '#kernel/result';
import { openNodeProjectFiles } from '#adapters/formats/node-project-files';
import { nodeProjectWriter } from '#adapters/workspace/node-project-writer';

/**
 * Opens a folder on disk as project files and a writer, named after the folder. Its location is
 * its real path, so the same folder reached through a link keeps the same drafts.
 */
export const nodeProjectOpener: ProjectFilesOpener = {
  async open(folder) {
    const files = await openNodeProjectFiles(folder);
    if (files.ok) {
      const location = await realpath(folder).catch(() => folder);
      return ok({
        files: files.value,
        writer: nodeProjectWriter(folder),
        name: basename(folder),
        location,
      });
    }
    const reason =
      files.error.code === 'files.root-not-found'
        ? 'not-found'
        : files.error.code === 'files.root-not-a-directory'
          ? 'not-a-folder'
          : 'unreadable';
    return err({ code: 'workspace.folder-unavailable', reason });
  },
};
