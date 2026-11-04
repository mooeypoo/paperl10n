// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `updates` domain: noticing that a newer Paper Lion is out (ADR 0018). Others
// import this file only, as `#domains/updates`. See docs/domains/updates.md.
export {
  isNewerVersion,
  isReleaseVersion,
  parseLatestRelease,
  type LatestRelease,
} from './domain/release.ts';
export {
  createUpdates,
  type UpdateCheck,
  type Updates,
  type UpdatesDependencies,
  type UpdateStatus,
} from './application/updates.ts';
export type { UpdateSource } from './application/ports/update-source.ts';
export type { UpdateStateStore } from './application/ports/update-state-store.ts';
