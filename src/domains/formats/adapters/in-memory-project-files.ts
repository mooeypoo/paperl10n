// SPDX-License-Identifier: GPL-3.0-or-later
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import {
  SKIPPED_DIRECTORIES,
  type FileAccessError,
  type ProjectFiles,
} from '../application/ports/project-files.ts';

/** A file tree: project-relative path → content (bytes for non-UTF-8 content). */
export type FileTree = Readonly<Record<string, string | Uint8Array>>;

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * `ProjectFiles` over an in-memory tree. Passes the same contract suite as the Node adapter. Tests
 * use it as a fake, and the browser UI harness uses it as its real file system (ADR 0015).
 */
export class InMemoryProjectFiles implements ProjectFiles {
  readonly #files = new Map<ProjectPath, string | Uint8Array>();
  readonly #directories = new Set<string>(['']);

  constructor(tree: FileTree) {
    for (const [raw, content] of Object.entries(tree)) {
      const path = projectPath(raw);
      if (!path.ok || path.value === '')
        throw new Error(`InMemoryProjectFiles: invalid path ${raw}`);
      this.#files.set(path.value, content);
      const segments = path.value.split('/');
      for (let i = 1; i < segments.length; i++)
        this.#directories.add(segments.slice(0, i).join('/'));
    }
  }

  list(
    dir: ProjectPath,
    filter?: { readonly extensions?: readonly string[] },
  ): Promise<Result<readonly ProjectPath[], FileAccessError>> {
    if (this.#files.has(dir))
      return Promise.resolve(err({ code: 'files.not-a-directory', path: dir }));
    if (!this.#directories.has(dir))
      return Promise.resolve(err({ code: 'files.not-found', path: dir }));

    const prefix = dir === '' ? '' : `${dir}/`;
    const extensions = filter?.extensions;
    const listed = [...this.#files.keys()]
      .filter((path) => path.startsWith(prefix))
      .filter((path) => !path.split('/').some((segment) => SKIPPED_DIRECTORIES.includes(segment)))
      .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
      .sort();
    return Promise.resolve(ok(listed));
  }

  readText(path: ProjectPath): Promise<Result<string, FileAccessError>> {
    const content = this.#files.get(path);
    if (content === undefined) {
      return Promise.resolve(
        err({ code: this.#directories.has(path) ? 'files.not-a-file' : 'files.not-found', path }),
      );
    }
    if (typeof content === 'string') return Promise.resolve(ok(content));
    try {
      return Promise.resolve(ok(utf8.decode(content)));
    } catch {
      return Promise.resolve(err({ code: 'files.not-utf8', path }));
    }
  }

  exists(path: ProjectPath): Promise<boolean> {
    return Promise.resolve(this.#files.has(path) || this.#directories.has(path));
  }

  /**
   * Replaces or creates a file; later reads see it. Not part of `ProjectFiles` (plugins only
   * read): it lets this class stand in for the app's project writer in tests and the UI harness.
   */
  writeText(
    path: ProjectPath,
    text: string,
  ): Promise<
    Result<
      void,
      { readonly code: 'files.not-found' | 'files.not-a-file'; readonly path: ProjectPath }
    >
  > {
    if (path === '' || this.#directories.has(path))
      return Promise.resolve(err({ code: 'files.not-a-file', path }));
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (!this.#directories.has(parent))
      return Promise.resolve(err({ code: 'files.not-found', path }));
    this.#files.set(path, text);
    return Promise.resolve(ok(undefined));
  }
}
