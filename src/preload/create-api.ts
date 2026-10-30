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
    suggestTargetLanguages: (request) =>
      invoke(channelFor('suggestTargetLanguages'), {
        projectId: request.projectId,
        recent: [...request.recent],
        systemLanguages: [...request.systemLanguages],
        uiLanguage: request.uiLanguage,
      }) as ReturnType<PaperLionApi['suggestTargetLanguages']>,
    searchTargetLanguages: (request) =>
      invoke(channelFor('searchTargetLanguages'), {
        projectId: request.projectId,
        query: request.query,
        uiLanguage: request.uiLanguage,
      }) as ReturnType<PaperLionApi['searchTargetLanguages']>,
    saveDocument: (request) =>
      invoke(channelFor('saveDocument'), {
        projectId: request.projectId,
        key: request.key,
        text: request.text,
        base: request.base,
      }) as ReturnType<PaperLionApi['saveDocument']>,
    saveDraft: (request) =>
      invoke(channelFor('saveDraft'), {
        projectId: request.projectId,
        key: request.key,
        text: request.text,
        base: request.base,
      }) as ReturnType<PaperLionApi['saveDraft']>,
    checkTranslation: (request) =>
      invoke(channelFor('checkTranslation'), {
        projectId: request.projectId,
        key: request.key,
        text: request.text,
      }) as ReturnType<PaperLionApi['checkTranslation']>,
    discardDraft: (request) =>
      invoke(channelFor('discardDraft'), {
        projectId: request.projectId,
        key: request.key,
      }) as ReturnType<PaperLionApi['discardDraft']>,
    markUpToDate: (request) =>
      invoke(channelFor('markUpToDate'), {
        projectId: request.projectId,
        key: request.key,
        sourceFingerprint: request.sourceFingerprint,
        sections: request.sections === null ? null : [...request.sections],
      }) as ReturnType<PaperLionApi['markUpToDate']>,
    markExistingUpToDate: (request) =>
      invoke(channelFor('markExistingUpToDate'), { projectId: request.projectId }) as ReturnType<
        PaperLionApi['markExistingUpToDate']
      >,
    chooseTargetLocale: (request) =>
      invoke(channelFor('chooseTargetLocale'), {
        projectId: request.projectId,
        language: request.language,
      }) as ReturnType<PaperLionApi['chooseTargetLocale']>,
  };
}
