// SPDX-License-Identifier: GPL-3.0-or-later
import { channelFor, type PaperLionApi } from '#ipc-contract';

/** Sends one IPC request (in the app: `ipcRenderer.invoke`). */
export type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/**
 * The renderer's API: each method forwards to its channel. The results are typed by the contract;
 * main is the only sender, and it returns exactly these shapes. This is the one place the
 * contract's types are asserted on data crossing the process boundary.
 */
export function createApi(invoke: Invoke): PaperLionApi {
  return {
    openProject: () => invoke(channelFor('openProject')) as ReturnType<PaperLionApi['openProject']>,
    listSourceDocuments: (request) =>
      invoke(channelFor('listSourceDocuments'), { projectId: request.projectId }) as ReturnType<
        PaperLionApi['listSourceDocuments']
      >,
    readDocumentPair: (request) =>
      invoke(channelFor('readDocumentPair'), {
        projectId: request.projectId,
        key: request.key,
      }) as ReturnType<PaperLionApi['readDocumentPair']>,
  };
}
