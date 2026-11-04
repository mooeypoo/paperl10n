// SPDX-License-Identifier: GPL-3.0-or-later
import type { Result } from '#kernel/result';
import type { LatestRelease } from '../../domain/release.ts';

/** Where the newest release is described: `latest.json` on GitHub, fetched in main. */
export interface UpdateSource {
  /**
   * The newest release (checked with `parseLatestRelease`). Failing is normal: the computer may be
   * offline, or the file may be one this version can't read.
   */
  latest(): Promise<Result<LatestRelease, 'unreachable'>>;
}
