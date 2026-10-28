// SPDX-License-Identifier: GPL-3.0-or-later
// The UI's only way to reach the app: the IPC contract, injected (ADR 0008). In Electron it's
// window.paperl10n from the preload; in tests and the UI harness, something else with the same type.
import type { PaperLionApi } from '#ipc-contract';
import { inject, type InjectionKey } from 'vue';

export const clientKey: InjectionKey<PaperLionApi> = Symbol('paperl10n-client');

export function useClient(): PaperLionApi {
  const client = inject(clientKey);
  if (client === undefined) throw new Error('useClient() needs a client provided by mountApp()');
  return client;
}
