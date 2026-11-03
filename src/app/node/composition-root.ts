// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron composition root: the real disk, the native folder dialog, in-memory sessions,
// drafts in the app's data folder, and the About window's files next to the app.
// Everything else is the shared app wiring (createAppApi).
import { randomUUID } from 'node:crypto';
import type { RegistryError } from '#domains/formats';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
import type { PaperLionApi } from '#ipc-contract';
import type { Result } from '#kernel/result';
import {
  createDialogFolderPicker,
  type ShowFolderDialog,
} from '#adapters/workspace/dialog-folder-picker';
import { InMemoryProjectSessions } from '#adapters/workspace/in-memory-project-sessions';
import { nodeDraftStore } from '#adapters/workspace/node-draft-store';
import { createAppApi } from '../create-app-api.ts';
import { readAboutFiles, type AboutFiles } from './about-files.ts';
import type { OnUnexpected } from '../guard-api.ts';
import { builtInPlugins } from '../plugins.ts';
import { nodeProjectOpener } from './node-project-opener.ts';

export interface ElectronRootDependencies {
  /** The app's name and version, and where its licence and components list are. */
  readonly about: AboutFiles;
  readonly showFolderDialog: ShowFolderDialog;
  /** Where drafts live: a folder in the app's data (`userData`), never in a project. */
  readonly draftsFolder: string;
  /** Where catalogs' drafts live: another folder in the app's data. */
  readonly catalogDraftsFolder: string;
  readonly onUnexpected: OnUnexpected;
}

export function createElectronAppApi(
  deps: ElectronRootDependencies,
): Result<PaperLionApi, RegistryError> {
  return createAppApi({
    readAbout: () => readAboutFiles(deps.about),
    folderPicker: createDialogFolderPicker(deps.showFolderDialog),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(() => randomUUID()),
    drafts: nodeDraftStore(deps.draftsFolder),
    catalogDrafts: nodeDraftStore(deps.catalogDraftsFolder),
    parser: createLezerMarkdownParser(),
    plugins: builtInPlugins,
    onUnexpected: deps.onUnexpected,
  });
}
