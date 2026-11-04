// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron composition root: the real disk, the native folder dialog, in-memory sessions,
// drafts and update state in the app's data folder, GitHub for update notices, and the About
// window's files next to the app.
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
import {
  GITHUB_HOSTS,
  githubUpdateSource,
  LATEST_RELEASE_URL,
} from '#adapters/updates/github-update-source';
import { nodeUpdateStateStore } from '#adapters/updates/node-update-state-store';
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
  /** Update notices (ADR 0018). */
  readonly updates: {
    /** Tests only: `latest.json` from this local server (plain http) instead of GitHub. */
    readonly testServer: string | undefined;
    /** The saved state: `updates.json` in the app's data. */
    readonly stateFile: string;
    /** Whether automatic checks may run: a release, or a test server in development. */
    readonly automaticAllowed: boolean;
  };
  readonly onUnexpected: OnUnexpected;
}

export function createElectronAppApi(
  deps: ElectronRootDependencies,
): Result<PaperLionApi, RegistryError> {
  return createAppApi({
    readAbout: () => readAboutFiles(deps.about),
    updates: {
      source: githubUpdateSource(
        deps.updates.testServer === undefined
          ? { url: LATEST_RELEASE_URL, hosts: GITHUB_HOSTS }
          : {
              url: deps.updates.testServer,
              hosts: [new URL(deps.updates.testServer).hostname],
              allowHttp: true,
            },
      ),
      store: nodeUpdateStateStore(deps.updates.stateFile),
      currentVersion: deps.about.version,
      automaticAllowed: deps.updates.automaticAllowed,
      now: () => Date.now(),
    },
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
