// SPDX-License-Identifier: GPL-3.0-or-later
import type { ApiMethod, ErrorDto, PaperLionApi } from '#ipc-contract';
import { err, type Result } from '#kernel/result';

/** Called when an API method throws: that's a bug, so it should be logged loudly. */
export type OnUnexpected = (method: ApiMethod, thrown: unknown) => void;

async function guard<T>(
  method: ApiMethod,
  onUnexpected: OnUnexpected,
  call: () => Promise<Result<T, ErrorDto>>,
): Promise<Result<T, ErrorDto>> {
  try {
    return await call();
  } catch (thrown) {
    onUnexpected(method, thrown);
    return err({ code: 'internal.unexpected', params: {}, details: [] });
  }
}

/**
 * Wraps every API method so it never rejects: an unexpected throw becomes `internal.unexpected`
 * (ADR 0007). Listing the methods explicitly means a new API method is a compile error here.
 */
export function guardApi(api: PaperLionApi, onUnexpected: OnUnexpected): PaperLionApi {
  return {
    openProject: () => guard('openProject', onUnexpected, () => api.openProject()),
    listSourceDocuments: (request) =>
      guard('listSourceDocuments', onUnexpected, () => api.listSourceDocuments(request)),
    listCatalogs: (request) => guard('listCatalogs', onUnexpected, () => api.listCatalogs(request)),
    readDocumentPair: (request) =>
      guard('readDocumentPair', onUnexpected, () => api.readDocumentPair(request)),
    suggestTargetLanguages: (request) =>
      guard('suggestTargetLanguages', onUnexpected, () => api.suggestTargetLanguages(request)),
    searchTargetLanguages: (request) =>
      guard('searchTargetLanguages', onUnexpected, () => api.searchTargetLanguages(request)),
    saveDocument: (request) => guard('saveDocument', onUnexpected, () => api.saveDocument(request)),
    saveDraft: (request) => guard('saveDraft', onUnexpected, () => api.saveDraft(request)),
    discardDraft: (request) => guard('discardDraft', onUnexpected, () => api.discardDraft(request)),
    checkTranslation: (request) =>
      guard('checkTranslation', onUnexpected, () => api.checkTranslation(request)),
    markUpToDate: (request) => guard('markUpToDate', onUnexpected, () => api.markUpToDate(request)),
    markExistingUpToDate: (request) =>
      guard('markExistingUpToDate', onUnexpected, () => api.markExistingUpToDate(request)),
    chooseTargetLocale: (request) =>
      guard('chooseTargetLocale', onUnexpected, () => api.chooseTargetLocale(request)),
  };
}
