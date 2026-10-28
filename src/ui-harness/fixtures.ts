// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileTree } from '#adapters/formats/in-memory-project-files';
import type { FolderPicker, ProjectFilesOpener } from '#domains/workspace';
import { err, ok } from '#kernel/result';
import { InMemoryProjectFiles } from '#adapters/formats/in-memory-project-files';

/** Fixture projects by name (`<plugin>/<fixture>`, e.g. `format-stub/basic`). */
export type Fixtures = ReadonlyMap<string, FileTree>;

const fixtureFile = /(?:^|\/)plugins\/([^/]+)\/fixtures\/([^/]+)\/(.+)$/;

/** Groups fixture files (path → content, as Vite's glob import returns them) into projects. */
export function fixturesFrom(files: Readonly<Record<string, string>>): Fixtures {
  const fixtures = new Map<string, Record<string, string>>();
  for (const [path, content] of Object.entries(files)) {
    const match = fixtureFile.exec(path);
    if (match === null) continue;
    const [, plugin, fixture, file] = match;
    if (plugin === undefined || fixture === undefined || file === undefined) continue;
    const name = `${plugin}/${fixture}`;
    const tree = fixtures.get(name) ?? {};
    tree[file] = content;
    fixtures.set(name, tree);
  }
  return fixtures;
}

/** The folder "path" the harness picker hands to the opener for a fixture. */
export function fixtureFolder(name: string): string {
  return `/fixtures/${name}`;
}

/** Always "picks" the given fixture's folder, like a user who always chooses the same folder. */
export function fixturePicker(name: string): FolderPicker {
  return { pick: () => Promise.resolve(fixtureFolder(name)) };
}

/** Opens fixture folders as in-memory project files. Unknown folders are "not found". */
export function fixtureOpener(fixtures: Fixtures): ProjectFilesOpener {
  return {
    open(folder) {
      const name = folder.startsWith('/fixtures/') ? folder.slice('/fixtures/'.length) : '';
      const tree = fixtures.get(name);
      if (tree === undefined) {
        return Promise.resolve(err({ code: 'workspace.folder-unavailable', reason: 'not-found' }));
      }
      const folderName = name.split('/').at(-1) ?? name;
      return Promise.resolve(ok({ files: new InMemoryProjectFiles(tree), name: folderName }));
    },
  };
}
