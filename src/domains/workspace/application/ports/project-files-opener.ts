// SPDX-License-Identifier: GPL-3.0-or-later
import type { ProjectFiles } from '#domains/formats';
import type { Result } from '#kernel/result';
import type { ProjectWriter } from './project-writer.ts';

export interface FolderUnavailable {
  readonly code: 'workspace.folder-unavailable';
  readonly reason: 'not-found' | 'not-a-folder' | 'unreadable';
}

export interface OpenedFolder {
  /** Reading the project (what plugins see). */
  readonly files: ProjectFiles;
  /** Writing into it (the app only). */
  readonly writer: ProjectWriter;
  /** The folder's display name. */
  readonly name: string;
}

/** Opens a folder the user chose as the project's files. */
export interface ProjectFilesOpener {
  open(folder: string): Promise<Result<OpenedFolder, FolderUnavailable>>;
}
