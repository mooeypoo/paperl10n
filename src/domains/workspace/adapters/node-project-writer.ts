// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { FileWriteError, ProjectWriter } from '../application/ports/project-writer.ts';

function errorCode(thrown: unknown): string | undefined {
  return typeof thrown === 'object' &&
    thrown !== null &&
    'code' in thrown &&
    typeof thrown.code === 'string'
    ? thrown.code
    : undefined;
}

/**
 * Writes into a project folder on disk. Each write goes to a temporary file next to the target,
 * is flushed, then renamed over it, so a crash leaves either the old file or the new one. A
 * symlinked file is written where it really lives (the link stays), and only if that's inside
 * the project; an existing file keeps its permissions.
 */
export function nodeProjectWriter(root: string): ProjectWriter {
  return {
    async writeText(path, text) {
      const target = await resolveTarget(root, path);
      if (!target.ok) return target;
      const temporary = join(
        dirname(target.value.real),
        `.${basename(target.value.real)}.paperl10n-${randomUUID()}.tmp`,
      );
      try {
        const handle = await open(temporary, 'wx', target.value.mode);
        try {
          await handle.writeFile(text, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, target.value.real);
        return ok(undefined);
      } catch {
        await unlink(temporary).catch(() => undefined);
        return err({ code: 'files.unwritable', path });
      }
    },
  };
}

interface Target {
  /** Where the file really is (or will be). */
  readonly real: string;
  /** The permissions to create it with: the existing file's, or the default. */
  readonly mode: number;
}

async function resolveTarget(
  root: string,
  path: ProjectPath,
): Promise<Result<Target, FileWriteError>> {
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return err({ code: 'files.not-found', path });
  }
  const inside = (real: string) => real.startsWith(realRoot + sep);
  if (path === '') return err({ code: 'files.not-a-file', path });
  const absolute = join(realRoot, ...path.split('/'));

  try {
    await lstat(absolute);
  } catch (thrown) {
    if (errorCode(thrown) !== 'ENOENT') return err({ code: 'files.unwritable', path });
    // A new file: its folder must exist inside the project.
    try {
      const parent = await realpath(dirname(absolute));
      if (parent !== realRoot && !inside(parent))
        return err({ code: 'files.outside-project', path });
      if (!(await stat(parent)).isDirectory()) return err({ code: 'files.not-found', path });
      return ok({ real: join(parent, basename(absolute)), mode: 0o666 });
    } catch {
      return err({ code: 'files.not-found', path });
    }
  }

  try {
    const real = await realpath(absolute);
    if (!inside(real)) return err({ code: 'files.outside-project', path });
    const info = await stat(real);
    if (!info.isFile()) return err({ code: 'files.not-a-file', path });
    return ok({ real, mode: info.mode & 0o7777 });
  } catch {
    // A dangling symlink, or a file that can't be inspected.
    return err({ code: 'files.unwritable', path });
  }
}
