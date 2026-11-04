// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { releaseProblems, type ReleaseFacts } from './release-checks.ts';

const ready: ReleaseFacts = {
  version: '0.2.0',
  branch: 'main',
  uncommitted: false,
  upToDate: true,
  lastTag: 'v0.1.0',
  packageVersion: '0.1.0',
  ci: 'success',
  changes: 12,
};

describe('releaseProblems', () => {
  it('goes ahead when main is ready', () => {
    expect(releaseProblems(ready)).toEqual([]);
  });

  it('allows the first release, with no earlier tag', () => {
    expect(
      releaseProblems({ ...ready, version: '0.1.0', lastTag: null, packageVersion: '0.0.0' }),
    ).toEqual([]);
  });

  it.each<[Partial<ReleaseFacts>, RegExp]>([
    [{ version: '0.2.0-beta.1' }, /plain version number/],
    [{ version: 'v0.2.0' }, /plain version number/],
    [{ version: undefined }, /plain version number.*nothing/],
    [{ branch: 'm6-i4-releasing' }, /Release from main/],
    [{ uncommitted: true }, /uncommitted/],
    [{ upToDate: false }, /differs from GitHub/],
    [{ version: '0.1.0' }, /isn't newer than the last release, 0\.1\.0/],
    [{ version: '0.0.9', packageVersion: '0.0.0' }, /isn't newer than the last release/],
    [{ version: '0.0.9', lastTag: null }, /older than the version in package\.json/],
    [{ ci: 'failed' }, /CI failed/],
    [{ ci: 'running' }, /still running/],
    [{ ci: 'none' }, /hasn't run/],
    [{ changes: 0 }, /Nothing has changed since v0\.1\.0/],
  ])('refuses %j', (change, problem) => {
    expect(releaseProblems({ ...ready, ...change })).toEqual([expect.stringMatching(problem)]);
  });
});
