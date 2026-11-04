// SPDX-License-Identifier: GPL-3.0-or-later
// What stops `pnpm release` (M6, question 8; the same as Plot Device's), as a pure rule over facts
// gathered from git and GitHub by release.ts, so it's tested without them.
import { compareVersions, parseVersion } from './changelog.ts';

export interface ReleaseFacts {
  /** The version asked for; `undefined` when none was given. */
  readonly version: string | undefined;
  readonly branch: string;
  readonly uncommitted: boolean;
  /** Main is the same as GitHub's. */
  readonly upToDate: boolean;
  /** The last release's tag (`v0.1.0`); `null` before the first. */
  readonly lastTag: string | null;
  /** package.json's version. */
  readonly packageVersion: string;
  /** CI on this commit. */
  readonly ci: 'success' | 'failed' | 'running' | 'none';
  /** Commits since the last release. */
  readonly changes: number;
}

/** Everything that stops a release, in plain words; an empty list means it can go ahead. */
export function releaseProblems(facts: ReleaseFacts): string[] {
  const { version, branch, uncommitted, upToDate, lastTag, packageVersion, ci, changes } = facts;
  if (version === undefined || parseVersion(version) === null) {
    return [`Give a plain version number, such as 0.2.0 (got ${version ?? 'nothing'}).`];
  }
  const problems: string[] = [];
  if (branch !== 'main') problems.push(`Release from main (you're on ${branch}).`);
  if (uncommitted) {
    problems.push('Commit or stash your changes first: the working tree has uncommitted changes.');
  }
  if (!upToDate) problems.push('Main differs from GitHub: pull or push first.');
  const tagged = lastTag?.replace(/^v/, '');
  if (tagged !== undefined && compareVersions(version, tagged) <= 0) {
    problems.push(`${version} isn't newer than the last release, ${tagged}.`);
  }
  if (parseVersion(packageVersion) !== null && compareVersions(version, packageVersion) < 0) {
    problems.push(`${version} is older than the version in package.json, ${packageVersion}.`);
  }
  if (ci !== 'success') {
    problems.push(
      ci === 'running'
        ? 'CI is still running on this commit: wait for it to finish.'
        : ci === 'none'
          ? "CI hasn't run on this commit yet."
          : 'CI failed on this commit: fix it first.',
    );
  }
  if (changes === 0) problems.push(`Nothing has changed since ${lastTag ?? 'the start'}.`);
  return problems;
}
