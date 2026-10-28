// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appBuildProblems, EXPECTED_BUILD_FILES, HARNESS_MARKER } from './app-build.ts';

const complete = new Map<string, string>(
  EXPECTED_BUILD_FILES.map((path) => [path, 'console.log("Paper Lion")']),
);

describe('appBuildProblems', () => {
  it('accepts a complete build without harness code (positive control)', () => {
    expect(appBuildProblems(complete)).toEqual([]);
  });

  it('reports harness code anywhere in the build', () => {
    const build = new Map(complete);
    build.set('renderer/assets/index-abc.js', `x.setAttribute("data-${HARNESS_MARKER}","")`);
    expect(appBuildProblems(build)).toEqual([
      `out/renderer/assets/index-abc.js contains UI harness code ("${HARNESS_MARKER}")`,
    ]);
  });

  it('reports a missing or incomplete build, so the check never passes on nothing', () => {
    expect(appBuildProblems(new Map())).toHaveLength(EXPECTED_BUILD_FILES.length);
    const build = new Map(complete);
    build.delete('renderer/index.html');
    expect(appBuildProblems(build)).toEqual([
      'out/renderer/index.html is missing: run `pnpm build` first',
    ]);
  });

  it('looks for the marker the harness actually writes', () => {
    const harness = readFileSync(new URL('../src/ui-harness/harness.ts', import.meta.url), 'utf8');
    expect(harness).toContain(`export const HARNESS_MARKER = '${HARNESS_MARKER}';`);
  });
});
