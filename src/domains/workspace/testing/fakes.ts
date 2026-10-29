// SPDX-License-Identifier: GPL-3.0-or-later
import { InMemoryProjectFiles, type FileTree } from '#domain-testing/formats';
import { err, ok, type Result } from '#kernel/result';
import type { FolderPicker } from '../application/ports/folder-picker.ts';
import type {
  FolderUnavailable,
  OpenedFolder,
  ProjectFilesOpener,
} from '../application/ports/project-files-opener.ts';

/** Answers with the given folder (or `null` for "cancelled"), and counts how often it was asked. */
export class FakeFolderPicker implements FolderPicker {
  calls = 0;
  readonly #answer: string | null;

  constructor(answer: string | null) {
    this.#answer = answer;
  }

  pick(): Promise<string | null> {
    this.calls++;
    return Promise.resolve(this.#answer);
  }
}

/**
 * Opens folders from a map of folder → in-memory file tree. Unknown folders are "not found".
 * Writes go to the opened copy, and later reads see them; `opened` keeps each copy for checks.
 */
export class FakeProjectFilesOpener implements ProjectFilesOpener {
  readonly #folders: Readonly<Record<string, FileTree>>;

  constructor(folders: Readonly<Record<string, FileTree>>) {
    this.#folders = folders;
  }

  readonly opened = new Map<string, InMemoryProjectFiles>();

  open(folder: string): Promise<Result<OpenedFolder, FolderUnavailable>> {
    const tree = this.#folders[folder];
    if (tree === undefined) {
      return Promise.resolve(err({ code: 'workspace.folder-unavailable', reason: 'not-found' }));
    }
    const name =
      folder
        .split('/')
        .filter((segment) => segment !== '')
        .at(-1) ?? folder;
    const files = new InMemoryProjectFiles(tree);
    this.opened.set(folder, files);
    return Promise.resolve(ok({ files, writer: files, name }));
  }
}
