// SPDX-License-Identifier: GPL-3.0-or-later
// Registers the IPC contract in the main process: one handler per API method, each checking the
// sender and validating arguments before calling the app. See docs/adr/0006-process-model-and-ipc.md.
import {
  apiMethods,
  channelFor,
  type ApiMethod,
  type ErrorDto,
  type PaperLionApi,
} from '#ipc-contract';
import { err, type Result } from '#kernel/result';

/** The renderer is untrusted input: every method's arguments are checked against the contract. */
export const argumentValidators: Readonly<
  Record<ApiMethod, (args: readonly unknown[]) => boolean>
> = {
  openProject: (args) => args.length === 0,
  listSourceDocuments: ([request, ...rest]) =>
    rest.length === 0 && hasExactly(request, ['projectId']) && isProjectId(request.projectId),
  readDocumentPair: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'key']) &&
    isProjectId(request.projectId) &&
    typeof request.key === 'string' &&
    request.key.length > 0 &&
    request.key.length <= 1000,
  suggestTargetLanguages: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'recent', 'systemLanguages', 'uiLanguage']) &&
    isProjectId(request.projectId) &&
    isLanguageList(request.recent) &&
    isLanguageList(request.systemLanguages) &&
    isLanguageCode(request.uiLanguage),
  searchTargetLanguages: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'query', 'uiLanguage']) &&
    isProjectId(request.projectId) &&
    typeof request.query === 'string' &&
    request.query.length <= 100 &&
    isLanguageCode(request.uiLanguage),
  saveDocument: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'key', 'text', 'base']) &&
    isProjectId(request.projectId) &&
    isDocumentKey(request.key) &&
    isDocumentText(request.text) &&
    (request.base === null || isDocumentText(request.base)),
  saveDraft: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'key', 'text', 'base']) &&
    isProjectId(request.projectId) &&
    isDocumentKey(request.key) &&
    isDocumentText(request.text) &&
    (request.base === null || isDocumentText(request.base)),
  discardDraft: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'key']) &&
    isProjectId(request.projectId) &&
    isDocumentKey(request.key),
  markUpToDate: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'key', 'sourceFingerprint', 'sections']) &&
    isProjectId(request.projectId) &&
    isDocumentKey(request.key) &&
    typeof request.sourceFingerprint === 'string' &&
    request.sourceFingerprint.length <= 100 &&
    (request.sections === null || isSectionList(request.sections)),
  markExistingUpToDate: ([request, ...rest]) =>
    rest.length === 0 && hasExactly(request, ['projectId']) && isProjectId(request.projectId),
  chooseTargetLocale: ([request, ...rest]) =>
    rest.length === 0 &&
    hasExactly(request, ['projectId', 'language']) &&
    isProjectId(request.projectId) &&
    isLanguageCode(request.language),
};

/** A plain object with exactly these keys, and nothing else. */
function hasExactly<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isDocumentKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1000;
}

/** A page's text: generous, but bounded (10 million UTF-16 code units, about 20 MB). */
function isDocumentText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 10_000_000;
}

/** Section indices: whole numbers, in order, none twice, and not absurdly many. */
function isSectionList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 10_000 &&
    value.every(
      (index: unknown, at) =>
        typeof index === 'number' &&
        Number.isSafeInteger(index) &&
        index >= 0 &&
        (at === 0 || index > (value[at - 1] as number)),
    )
  );
}

/** A language code as the renderer sends it. Its meaning is checked by the use case. */
function isLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100;
}

/** A short list of language codes (recent picks, OS languages). */
function isLanguageList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 20 && value.every(isLanguageCode);
}

export interface IpcEvent {
  readonly senderFrame: { readonly url: string; readonly parent: unknown } | null;
}

/** The part of Electron's `ipcMain` registration needs. */
export interface IpcRegistrar {
  handle(
    channel: string,
    listener: (event: IpcEvent, ...args: unknown[]) => Promise<unknown>,
  ): void;
}

function invalidRequest(): Result<never, ErrorDto> {
  return err({ code: 'internal.invalid-request', params: {}, details: [] });
}

/** Calls an API method with arguments that have already been validated. */
function call(api: PaperLionApi, method: ApiMethod, args: readonly unknown[]): Promise<unknown> {
  switch (method) {
    case 'openProject':
      return api.openProject();
    case 'listSourceDocuments': {
      const [request] = args as [{ projectId: string }]; // checked by argumentValidators
      return api.listSourceDocuments({ projectId: request.projectId });
    }
    case 'readDocumentPair': {
      const [request] = args as [{ projectId: string; key: string }]; // checked by argumentValidators
      return api.readDocumentPair({ projectId: request.projectId, key: request.key });
    }
    case 'suggestTargetLanguages': {
      // checked by argumentValidators
      const [request] = args as [
        { projectId: string; recent: string[]; systemLanguages: string[]; uiLanguage: string },
      ];
      return api.suggestTargetLanguages({
        projectId: request.projectId,
        recent: [...request.recent],
        systemLanguages: [...request.systemLanguages],
        uiLanguage: request.uiLanguage,
      });
    }
    case 'searchTargetLanguages': {
      const [request] = args as [{ projectId: string; query: string; uiLanguage: string }]; // checked by argumentValidators
      return api.searchTargetLanguages({
        projectId: request.projectId,
        query: request.query,
        uiLanguage: request.uiLanguage,
      });
    }
    case 'saveDocument': {
      // checked by argumentValidators
      const [request] = args as [
        { projectId: string; key: string; text: string; base: string | null },
      ];
      return api.saveDocument({
        projectId: request.projectId,
        key: request.key,
        text: request.text,
        base: request.base,
      });
    }
    case 'saveDraft': {
      // checked by argumentValidators
      const [request] = args as [
        { projectId: string; key: string; text: string; base: string | null },
      ];
      return api.saveDraft({
        projectId: request.projectId,
        key: request.key,
        text: request.text,
        base: request.base,
      });
    }
    case 'discardDraft': {
      const [request] = args as [{ projectId: string; key: string }]; // checked by argumentValidators
      return api.discardDraft({ projectId: request.projectId, key: request.key });
    }
    case 'markUpToDate': {
      // checked by argumentValidators
      const [request] = args as [
        { projectId: string; key: string; sourceFingerprint: string; sections: number[] | null },
      ];
      return api.markUpToDate({
        projectId: request.projectId,
        key: request.key,
        sourceFingerprint: request.sourceFingerprint,
        sections: request.sections === null ? null : [...request.sections],
      });
    }
    case 'markExistingUpToDate': {
      const [request] = args as [{ projectId: string }]; // checked by argumentValidators
      return api.markExistingUpToDate({ projectId: request.projectId });
    }
    case 'chooseTargetLocale': {
      const [request] = args as [{ projectId: string; language: string }]; // checked by argumentValidators
      return api.chooseTargetLocale({ projectId: request.projectId, language: request.language });
    }
  }
}

/**
 * Registers every API method. Requests from anything but the app's own top-level page, or with
 * arguments that don't match the contract, get `internal.invalid-request` and never reach the app.
 */
export function registerApi(
  ipc: IpcRegistrar,
  api: PaperLionApi,
  isTrustedSender: (event: IpcEvent) => boolean,
  onRejected: (method: ApiMethod, reason: 'untrusted-sender' | 'invalid-arguments') => void,
): void {
  for (const method of apiMethods) {
    ipc.handle(channelFor(method), async (event, ...args) => {
      if (!isTrustedSender(event)) {
        onRejected(method, 'untrusted-sender');
        return invalidRequest();
      }
      if (!argumentValidators[method](args)) {
        onRejected(method, 'invalid-arguments');
        return invalidRequest();
      }
      return call(api, method, args);
    });
  }
}

/** A trusted sender is the app's own top-level frame. */
export function trustedSenderCheck(
  isAppUrl: (url: string) => boolean,
): (event: IpcEvent) => boolean {
  return (event) =>
    event.senderFrame !== null &&
    event.senderFrame.parent === null &&
    isAppUrl(event.senderFrame.url);
}
