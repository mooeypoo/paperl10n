// SPDX-License-Identifier: GPL-3.0-or-later
import { basename } from 'node:path';
import type { ProjectFilesOpener } from '#domains/workspace';
import { err, ok } from '#kernel/result';
import { openNodeProjectFiles } from '#adapters/formats/node-project-files';
import { nodeProjectWriter } from '#adapters/workspace/node-project-writer';

/** Opens a folder on disk as project files and a writer, named after the folder. */
export const nodeProjectOpener: ProjectFilesOpener = {
  async open(folder) {
    const files = await openNodeProjectFiles(folder);
    if (files.ok) {
      return ok({ files: files.value, writer: nodeProjectWriter(folder), name: basename(folder) });
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
