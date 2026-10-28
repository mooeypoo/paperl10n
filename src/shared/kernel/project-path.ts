// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from './brand.ts';
import { err, ok, type Result } from './result.ts';

/**
 * A path inside the opened project, relative to its root, using `/` separators.
 * Never absolute and never contains `..`, so it can't point outside the project.
 * The project root itself is the empty path (`PROJECT_ROOT`).
 */
export type ProjectPath = Brand<string, 'ProjectPath'>;

export const PROJECT_ROOT = '' as ProjectPath;

export type InvalidProjectPathReason =
  | 'absolute'
  | 'parent-segment'
  | 'backslash'
  | 'control-character';

export interface InvalidProjectPath {
  readonly code: 'project-path.invalid';
  readonly reason: InvalidProjectPathReason;
  readonly input: string;
}

/**
 * Validates and normalizes a project-relative path.
 * `./a//b/` becomes `a/b`; `''` and `'.'` become the project root.
 */
export function projectPath(input: string): Result<ProjectPath, InvalidProjectPath> {
  const invalid = (reason: InvalidProjectPathReason) =>
    err<InvalidProjectPath>({ code: 'project-path.invalid', reason, input });

  // Control characters (including NUL) are never valid in a path we write back to disk.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(input)) return invalid('control-character');
  // Backslashes are rejected rather than converted: `a\b` is a valid file name on POSIX.
  if (input.includes('\\')) return invalid('backslash');
  if (input.startsWith('/') || /^[a-zA-Z]:/.test(input)) return invalid('absolute');

  const segments = input.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) return invalid('parent-segment');

  return ok(segments.join('/') as ProjectPath);
}
