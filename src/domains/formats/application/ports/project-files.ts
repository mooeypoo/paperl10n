// SPDX-License-Identifier: GPL-3.0-or-later
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';

/** Folders never listed: version control and installed dependencies. Other dot-folders
 * (`.vitepress`) are listed, because format plugins need them. */
export const SKIPPED_DIRECTORIES: readonly string[] = ['.git', 'node_modules'];

export interface FileAccessError {
  readonly code:
    | 'files.not-found'
    | 'files.not-a-directory'
    | 'files.not-a-file'
    | 'files.not-utf8'
    | 'files.unreadable'
    | 'files.outside-project';
  readonly path: ProjectPath;
}

/**
 * A read-only view of an opened project: the only way a plugin sees the disk.
 * Paths are project-relative; `PROJECT_ROOT` (`''`) is the project folder itself.
 * Behavior is specified once by the contract suite in `formats/testing/`.
 */
export interface ProjectFiles {
  /**
   * Every file under `dir`, recursively, as project-relative paths sorted by code unit.
   * Skips `SKIPPED_DIRECTORIES` at any depth. `extensions` (e.g. `['.md']`) matches exactly.
   */
  list(
    dir: ProjectPath,
    filter?: { readonly extensions?: readonly string[] },
  ): Promise<Result<readonly ProjectPath[], FileAccessError>>;

  /** The file's text exactly as stored (a BOM and CRLF line endings are kept). Must be UTF-8. */
  readText(path: ProjectPath): Promise<Result<string, FileAccessError>>;

  /** Whether a file or folder exists at `path`. */
  exists(path: ProjectPath): Promise<boolean>;
}
