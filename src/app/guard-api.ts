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
  };
}
