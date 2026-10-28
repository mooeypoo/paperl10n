// SPDX-License-Identifier: GPL-3.0-or-later
import type { ProjectPath } from '#kernel/project-path';

export type DetectionConfidence = 'certain' | 'likely' | 'fallback';

/**
 * A plugin's answer to "does this project look like yours?".
 * `certain`: the system's own config file is there (e.g. `.vitepress/config.ts`).
 * `likely`: strong hints. `fallback`: the plugin could handle it, but so could others.
 */
export type Detection =
  | { readonly matches: false }
  | {
      readonly matches: true;
      readonly confidence: DetectionConfidence;
      /** Files that convinced the plugin, for showing the user why. */
      readonly evidence: readonly ProjectPath[];
    };

const rank: Readonly<Record<DetectionConfidence, number>> = { certain: 0, likely: 1, fallback: 2 };

/** Orders matches best first; ties are broken by id so the order is stable. */
export function compareMatches(
  a: { readonly id: string; readonly confidence: DetectionConfidence },
  b: { readonly id: string; readonly confidence: DetectionConfidence },
): number {
  return rank[a.confidence] - rank[b.confidence] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
