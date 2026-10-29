// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron composition root: the real disk, the native folder dialog, in-memory sessions,
// and drafts in the app's data folder.
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
import type { OnUnexpected } from '../guard-api.ts';
import { builtInPlugins } from '../plugins.ts';
import { nodeProjectOpener } from './node-project-opener.ts';

export interface ElectronRootDependencies {
  readonly showFolderDialog: ShowFolderDialog;
  /** Where drafts live: a folder in the app's data (`userData`), never in a project. */
  readonly draftsFolder: string;
  readonly onUnexpected: OnUnexpected;
}

export function createElectronAppApi(
  deps: ElectronRootDependencies,
): Result<PaperLionApi, RegistryError> {
  return createAppApi({
    folderPicker: createDialogFolderPicker(deps.showFolderDialog),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(() => randomUUID()),
    drafts: nodeDraftStore(deps.draftsFolder),
    parser: createLezerMarkdownParser(),
    plugins: builtInPlugins,
    onUnexpected: deps.onUnexpected,
  });
}
