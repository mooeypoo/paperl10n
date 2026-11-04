// SPDX-License-Identifier: GPL-3.0-or-later
// What Paper Lion remembers about updates between runs (`updates.json` in the app's data).
import {
  isNewerVersion,
  isReleaseVersion,
  parseLatestRelease,
  type LatestRelease,
} from './release.ts';

export interface UpdateState {
  /** When the last check got an answer (ms since the epoch); `null`: never. */
  readonly checkedAt: number | null;
  /** The newest release that answer named. */
  readonly latest: LatestRelease | null;
  /** The version the user said not to mention again ("Not now"). */
  readonly dismissed: string | null;
  /** Whether Paper Lion checks by itself once a day (the user's setting; on by default). */
  readonly automatic: boolean;
}

export const initialUpdateState: UpdateState = {
  checkedAt: null,
  latest: null,
  dismissed: null,
  automatic: true,
};

/** Automatic checks ask at most this often. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Reads saved state leniently: it's only a cache, so anything unexpected is forgotten, field by
 * field (a broken `latest` doesn't lose the setting).
 */
export function parseUpdateState(text: string | null): UpdateState {
  let data: unknown;
  try {
    data = JSON.parse(text ?? 'null');
  } catch {
    return initialUpdateState;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return initialUpdateState;
  const saved = data as Record<string, unknown>;
  return {
    checkedAt:
      typeof saved.checkedAt === 'number' && Number.isFinite(saved.checkedAt)
        ? saved.checkedAt
        : null,
    latest: parseLatestRelease(saved.latest),
    dismissed: isReleaseVersion(saved.dismissed) ? saved.dismissed : null,
    automatic: typeof saved.automatic === 'boolean' ? saved.automatic : true,
  };
}

/** The release is saved as `latest.json` gives it (with its `format`), so it's read the same way. */
export function serializeUpdateState(state: UpdateState): string {
  const latest = state.latest === null ? null : { format: 1, ...state.latest };
  return `${JSON.stringify({ ...state, latest }, null, 2)}\n`;
}

/**
 * Whether an automatic check is due: never checked, a day has passed, or the last check is in the
 * future (a clock set backwards must not stop checks for good).
 */
export function isCheckDue(checkedAt: number | null, now: number): boolean {
  return checkedAt === null || now - checkedAt >= CHECK_INTERVAL_MS || checkedAt > now;
}

/** The release to mention: newer than the running version and not dismissed, while checks are on. */
export function updateNotice(state: UpdateState, currentVersion: string): LatestRelease | null {
  const latest = state.latest;
  if (!state.automatic || latest === null) return null;
  if (!isNewerVersion(latest.version, currentVersion)) return null;
  return latest.version === state.dismissed ? null : latest;
}
