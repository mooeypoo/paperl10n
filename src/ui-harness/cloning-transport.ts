// SPDX-License-Identifier: GPL-3.0-or-later
import type { PaperLionApi } from '#ipc-contract';

async function crossing<T>(call: () => Promise<T>): Promise<T> {
  return structuredClone(await call());
}

/**
 * Stands in for IPC: requests and results are structured-cloned, as Electron does between
 * processes. So the UI gets copies, never shared objects, and a result that couldn't cross IPC
 * (a function, a class instance with private fields) rejects here too. Listing the methods
 * explicitly means a new API method is a compile error here.
 */
export function cloningTransport(api: PaperLionApi): PaperLionApi {
  return {
    openProject: () => crossing(() => api.openProject()),
    listSourceDocuments: (request) =>
      crossing(() => api.listSourceDocuments(structuredClone(request))),
    readDocumentPair: (request) => crossing(() => api.readDocumentPair(structuredClone(request))),
    suggestTargetLanguages: (request) =>
      crossing(() => api.suggestTargetLanguages(structuredClone(request))),
    searchTargetLanguages: (request) =>
      crossing(() => api.searchTargetLanguages(structuredClone(request))),
    saveDocument: (request) => crossing(() => api.saveDocument(structuredClone(request))),
    saveDraft: (request) => crossing(() => api.saveDraft(structuredClone(request))),
    discardDraft: (request) => crossing(() => api.discardDraft(structuredClone(request))),
    checkTranslation: (request) => crossing(() => api.checkTranslation(structuredClone(request))),
    markUpToDate: (request) => crossing(() => api.markUpToDate(structuredClone(request))),
    markExistingUpToDate: (request) =>
      crossing(() => api.markExistingUpToDate(structuredClone(request))),
    chooseTargetLocale: (request) =>
      crossing(() => api.chooseTargetLocale(structuredClone(request))),
  };
}
