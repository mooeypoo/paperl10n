// SPDX-License-Identifier: GPL-3.0-or-later
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';

export interface FileWriteError {
  readonly code:
    'files.not-found' | 'files.not-a-file' | 'files.outside-project' | 'files.unwritable';
  readonly path: ProjectPath;
}

/**
 * Writes files into the opened project. Only the app writes (plugins only read, through
 * `ProjectFiles`). Behavior: `describeProjectWriterContract`.
 */
export interface ProjectWriter {
  /**
   * Replaces a file's text, or creates the file, atomically: a reader sees the old content or the
   * new, never a mix, and a failed write leaves the old file as it was. The text is written
   * exactly as given, as UTF-8. The parent folder must exist (`files.not-found` otherwise).
   */
  writeText(path: ProjectPath, text: string): Promise<Result<void, FileWriteError>>;
}
