// SPDX-License-Identifier: GPL-3.0-or-later
// Update notices (M6, ADR 0018). Nothing is downloaded or installed: Paper Lion only learns that a
// newer version exists and links to it. A failed check is quiet, and the next one tries again.
import { isNewerVersion, type LatestRelease } from '../domain/release.ts';
import {
  isCheckDue,
  parseUpdateState,
  serializeUpdateState,
  updateNotice,
  type UpdateState,
} from '../domain/update-state.ts';
import type { UpdateSource } from './ports/update-source.ts';
import type { UpdateStateStore } from './ports/update-state-store.ts';

export interface UpdateStatus {
  /** The user's setting: check once a day. */
  readonly automatic: boolean;
  /** A newer version to mention; `null`: none (or it was dismissed, or checks are off). */
  readonly notice: LatestRelease | null;
}

/** "Check for updates", asked by the user. A dismissed version is reported too. */
export type UpdateCheck =
  | { readonly kind: 'newer'; readonly release: LatestRelease }
  | { readonly kind: 'newest' }
  | { readonly kind: 'failed' };

export interface Updates {
  /** The setting and the notice, after checking first when an automatic check is due. */
  status(): Promise<UpdateStatus>;
  /** Asks now, whatever the setting. */
  checkNow(): Promise<UpdateCheck>;
  /** "Not now": stops mentioning `version`, across restarts. */
  dismiss(version: string): Promise<void>;
  /** Turns daily checks on or off. Turning them on checks at once, if one is due. */
  setAutomatic(enabled: boolean): Promise<UpdateStatus>;
}

export interface UpdatesDependencies {
  readonly source: UpdateSource;
  readonly store: UpdateStateStore;
  /** The running version. */
  readonly currentVersion: string;
  /** Whether automatic checks may run at all: a packaged app, or a test server in development. */
  readonly automaticAllowed: boolean;
  readonly now: () => number;
}

export function createUpdates(deps: UpdatesDependencies): Updates {
  // The saved state, read once; every change replaces it here first, then saves it.
  let loaded: Promise<UpdateState> | null = null;
  const current = (): Promise<UpdateState> =>
    (loaded ??= deps.store.read().then(parseUpdateState, () => parseUpdateState(null)));
  // Saves run one after another, so a slow one can't land after, and undo, a later one. A save
  // that fails is forgotten: the state is only a cache, and the app goes on with it in memory.
  let saving: Promise<unknown> = Promise.resolve();
  // One check at a time: asking for the status while a check runs waits for that check.
  let checking: Promise<LatestRelease | 'failed'> | null = null;

  function save(next: UpdateState): Promise<unknown> {
    loaded = Promise.resolve(next);
    const text = serializeUpdateState(next);
    saving = saving.then(() => deps.store.write(text)).catch(() => undefined);
    return saving;
  }

  async function fetchLatest(): Promise<LatestRelease | 'failed'> {
    const answer = await deps.source.latest();
    if (!answer.ok) return 'failed';
    await save({ ...(await current()), checkedAt: deps.now(), latest: answer.value });
    return answer.value;
  }

  function ask(): Promise<LatestRelease | 'failed'> {
    checking ??= fetchLatest()
      .catch(() => 'failed' as const)
      .finally(() => {
        checking = null;
      });
    return checking;
  }

  const statusOf = (saved: UpdateState): UpdateStatus => ({
    automatic: saved.automatic,
    notice: updateNotice(saved, deps.currentVersion),
  });

  async function status(): Promise<UpdateStatus> {
    const saved = await current();
    if (deps.automaticAllowed && saved.automatic && isCheckDue(saved.checkedAt, deps.now())) {
      await ask();
    }
    return statusOf(await current());
  }

  return {
    status,
    async checkNow() {
      const answer = await ask();
      if (answer === 'failed') return { kind: 'failed' };
      return isNewerVersion(answer.version, deps.currentVersion)
        ? { kind: 'newer', release: answer }
        : { kind: 'newest' };
    },
    async dismiss(version) {
      await save({ ...(await current()), dismissed: version });
    },
    async setAutomatic(enabled) {
      await save({ ...(await current()), automatic: enabled });
      return status();
    },
  };
}
