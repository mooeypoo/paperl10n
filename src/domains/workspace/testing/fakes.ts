// SPDX-License-Identifier: GPL-3.0-or-later
import { InMemoryProjectFiles, type FileTree } from '#domain-testing/formats';
import { err, ok, type Result } from '#kernel/result';
import type { FolderPicker } from '../application/ports/folder-picker.ts';
import type {
  FolderUnavailable,
  ProjectFilesOpener,
} from '../application/ports/project-files-opener.ts';
import type { ProjectFiles } from '#domains/formats';

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

/** Opens folders from a map of folder → in-memory file tree. Unknown folders are "not found". */
export class FakeProjectFilesOpener implements ProjectFilesOpener {
  readonly #folders: Readonly<Record<string, FileTree>>;

  constructor(folders: Readonly<Record<string, FileTree>>) {
    this.#folders = folders;
  }

  open(folder: string): Promise<Result<{ files: ProjectFiles; name: string }, FolderUnavailable>> {
    const tree = this.#folders[folder];
    if (tree === undefined) {
      return Promise.resolve(err({ code: 'workspace.folder-unavailable', reason: 'not-found' }));
    }
    const name =
      folder
        .split('/')
        .filter((segment) => segment !== '')
        .at(-1) ?? folder;
    return Promise.resolve(ok({ files: new InMemoryProjectFiles(tree), name }));
  }
}
