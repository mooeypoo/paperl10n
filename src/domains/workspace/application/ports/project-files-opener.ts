// SPDX-License-Identifier: GPL-3.0-or-later
import type { ProjectFiles } from '#domains/formats';
import type { Result } from '#kernel/result';

export interface FolderUnavailable {
  readonly code: 'workspace.folder-unavailable';
  readonly reason: 'not-found' | 'not-a-folder' | 'unreadable';
}

/** Opens a folder the user chose as the project's files. */
export interface ProjectFilesOpener {
  open(
    folder: string,
  ): Promise<Result<{ readonly files: ProjectFiles; readonly name: string }, FolderUnavailable>>;
}
