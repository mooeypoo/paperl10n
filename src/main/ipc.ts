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
    rest.length === 0 &&
    typeof request === 'object' &&
    request !== null &&
    Object.keys(request).length === 1 &&
    'projectId' in request &&
    typeof request.projectId === 'string' &&
    request.projectId.length > 0 &&
    request.projectId.length <= 200,
};

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
