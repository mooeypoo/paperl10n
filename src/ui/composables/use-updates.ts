// SPDX-License-Identifier: GPL-3.0-or-later
import type { PaperLionApi, UpdateCheckDto, UpdateStatusDto } from '#ipc-contract';
import { shallowRef, type ShallowRef } from 'vue';

/** About's "Check for updates": not asked yet, asking, or the answer. */
export type UpdateCheckState = 'idle' | 'checking' | UpdateCheckDto;

export interface UpdatesState {
  /** The setting and the notice; `null` until main first answers. */
  readonly status: ShallowRef<UpdateStatusDto | null>;
  readonly check: ShallowRef<UpdateCheckState>;
  /** Asks main for the status; main checks GitHub first when a check is due. */
  refresh(): Promise<void>;
  /** "Not now". */
  dismiss(version: string): Promise<void>;
  /** "Check for updates", then the status again (the notice may have changed). */
  checkNow(): Promise<void>;
  setAutomatic(enabled: boolean): Promise<void>;
  /** Asks now and every `intervalMs` (main still checks at most once a day); returns a stop. */
  start(intervalMs?: number): () => void;
}

/** How often the page asks main: often enough that a long session hears of a release that day. */
export const UPDATE_POLL_MS = 6 * 60 * 60 * 1000;

/** Update notices (ADR 0018). Quiet: a failed request leaves things as they were. */
export function useUpdates(client: PaperLionApi): UpdatesState {
  const status = shallowRef<UpdateStatusDto | null>(null);
  const check = shallowRef<UpdateCheckState>('idle');

  async function refresh(): Promise<void> {
    const result = await client.getUpdateStatus().catch(() => null);
    if (result?.ok === true) status.value = result.value;
  }

  return {
    status,
    check,
    refresh,
    async dismiss(version) {
      // Hidden at once; main remembers it.
      if (status.value?.notice?.version === version) {
        status.value = { ...status.value, notice: null };
      }
      await client.dismissUpdate({ version }).catch(() => null);
    },
    async checkNow() {
      check.value = 'checking';
      const result = await client.checkForUpdates().catch(() => null);
      check.value = result?.ok === true ? result.value : { kind: 'failed' };
      await refresh();
    },
    async setAutomatic(enabled) {
      const result = await client.setAutomaticUpdateChecks({ enabled }).catch(() => null);
      if (result?.ok === true) status.value = result.value;
    },
    start(intervalMs = UPDATE_POLL_MS) {
      void refresh();
      const timer = setInterval(() => void refresh(), intervalMs);
      return () => {
        clearInterval(timer);
      };
    },
  };
}
