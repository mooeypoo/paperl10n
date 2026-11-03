// SPDX-License-Identifier: GPL-3.0-or-later
import type { AboutDto, ErrorDto, PaperLionApi } from '#ipc-contract';
import { shallowRef, type ShallowRef } from 'vue';

export interface AboutState {
  /** `null` until loaded (or when loading failed). */
  readonly about: ShallowRef<AboutDto | null>;
  readonly error: ShallowRef<ErrorDto | null>;
  /** Asks main for About's contents, once: they don't change while the app runs. */
  load(): Promise<void>;
}

const transportFailed: ErrorDto = { code: 'internal.unexpected', params: {}, details: [] };

export function useAbout(client: PaperLionApi): AboutState {
  const about = shallowRef<AboutDto | null>(null);
  const error = shallowRef<ErrorDto | null>(null);

  async function load(): Promise<void> {
    if (about.value !== null) return;
    const result = await client
      .getAbout()
      .catch(() => ({ ok: false as const, error: transportFailed }));
    if (result.ok) {
      about.value = result.value;
      error.value = null;
    } else {
      error.value = result.error;
    }
  }

  return { about, error, load };
}
