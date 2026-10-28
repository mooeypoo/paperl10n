// SPDX-License-Identifier: GPL-3.0-or-later
import type { Dirent } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import {
  SKIPPED_DIRECTORIES,
  type FileAccessError,
  type ProjectFiles,
} from '../application/ports/project-files.ts';

export interface ProjectRootError {
  readonly code: 'files.root-not-found' | 'files.root-not-a-directory' | 'files.root-unreadable';
  readonly root: string;
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function errorCode(thrown: unknown): string | undefined {
  return typeof thrown === 'object' &&
    thrown !== null &&
    'code' in thrown &&
    typeof thrown.code === 'string'
    ? thrown.code
    : undefined;
}

/**
 * Opens a folder on disk as `ProjectFiles`. Symlinks are resolved: a file whose real location is
 * outside the project is never listed or read (`files.outside-project`), and symlinked folders
 * aren't followed when listing, which also rules out loops.
 */
export async function openNodeProjectFiles(
  root: string,
): Promise<Result<ProjectFiles, ProjectRootError>> {
  try {
    const realRoot = await realpath(root);
    if (!(await stat(realRoot)).isDirectory())
      return err({ code: 'files.root-not-a-directory', root });
    return ok(new NodeProjectFiles(realRoot));
  } catch (thrown) {
    const code = errorCode(thrown) === 'ENOENT' ? 'files.root-not-found' : 'files.root-unreadable';
    return err({ code, root });
  }
}

type Resolved =
  | { readonly ok: true; readonly real: string }
  | { readonly ok: false; readonly code: FileAccessError['code'] };

class NodeProjectFiles implements ProjectFiles {
  readonly #root: string;

  constructor(realRoot: string) {
    this.#root = realRoot;
  }

  /** The real absolute location of a project path, if it exists inside the project. */
  async #resolve(path: ProjectPath): Promise<Resolved> {
    try {
      const real = await realpath(join(this.#root, ...path.split('/')));
      const inside = real === this.#root || real.startsWith(this.#root + sep);
      return inside ? { ok: true, real } : { ok: false, code: 'files.outside-project' };
    } catch (thrown) {
      const code = errorCode(thrown);
      return {
        ok: false,
        code: code === 'ENOENT' || code === 'ENOTDIR' ? 'files.not-found' : 'files.unreadable',
      };
    }
  }

  #isInside(real: string): boolean {
    return real === this.#root || real.startsWith(this.#root + sep);
  }

  async list(
    dir: ProjectPath,
    filter?: { readonly extensions?: readonly string[] },
  ): Promise<Result<readonly ProjectPath[], FileAccessError>> {
    const resolved = await this.#resolve(dir);
    if (!resolved.ok) return err({ code: resolved.code, path: dir });
    try {
      if (!(await stat(resolved.real)).isDirectory())
        return err({ code: 'files.not-a-directory', path: dir });
      const found: ProjectPath[] = [];
      await this.#walk(resolved.real, dir === '' ? '' : `${dir}/`, found);
      const extensions = filter?.extensions;
      const listed =
        extensions === undefined
          ? found
          : found.filter((path) => extensions.some((ext) => path.endsWith(ext)));
      return ok(listed.sort());
    } catch {
      return err({ code: 'files.unreadable', path: dir });
    }
  }

  async #walk(absolute: string, prefix: string, found: ProjectPath[]): Promise<void> {
    const entries: Dirent[] = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const path = `${prefix}${entry.name}` as ProjectPath; // a child of a valid ProjectPath
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.includes(entry.name))
          await this.#walk(join(absolute, entry.name), `${path}/`, found);
      } else if (entry.isFile()) {
        found.push(path);
      } else if (
        entry.isSymbolicLink() &&
        (await this.#isFileLinkInside(join(absolute, entry.name)))
      ) {
        found.push(path);
      }
    }
  }

  /** A symlink is listed only if it points to a file inside the project. */
  async #isFileLinkInside(link: string): Promise<boolean> {
    try {
      const real = await realpath(link);
      return this.#isInside(real) && (await stat(real)).isFile();
    } catch {
      return false;
    }
  }

  async readText(path: ProjectPath): Promise<Result<string, FileAccessError>> {
    const resolved = await this.#resolve(path);
    if (!resolved.ok) return err({ code: resolved.code, path });
    let bytes: Buffer;
    try {
      if ((await stat(resolved.real)).isDirectory()) return err({ code: 'files.not-a-file', path });
      bytes = await readFile(resolved.real);
    } catch {
      return err({ code: 'files.unreadable', path });
    }
    try {
      return ok(utf8.decode(bytes));
    } catch {
      return err({ code: 'files.not-utf8', path });
    }
  }

  async exists(path: ProjectPath): Promise<boolean> {
    return (await this.#resolve(path)).ok;
  }
}
