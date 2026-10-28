// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron composition root: the real disk, the native folder dialog, in-memory sessions.
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
import { createAppApi } from '../create-app-api.ts';
import type { OnUnexpected } from '../guard-api.ts';
import { builtInPlugins } from '../plugins.ts';
import { nodeProjectOpener } from './node-project-opener.ts';

export interface ElectronRootDependencies {
  readonly showFolderDialog: ShowFolderDialog;
  readonly onUnexpected: OnUnexpected;
}

export function createElectronAppApi(
  deps: ElectronRootDependencies,
): Result<PaperLionApi, RegistryError> {
  return createAppApi({
    folderPicker: createDialogFolderPicker(deps.showFolderDialog),
    opener: nodeProjectOpener,
    sessions: new InMemoryProjectSessions(() => randomUUID()),
    parser: createLezerMarkdownParser(),
    plugins: builtInPlugins,
    onUnexpected: deps.onUnexpected,
  });
}
