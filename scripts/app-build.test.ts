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

  it('reports a package main or the preload loads at run time, but not Electron or Node’s own', () => {
    const build = new Map(complete);
    build.set(
      'main/index.js',
      'import { app } from "electron";\nimport { join } from "node:path";\nimport { GFM } from "@lezer/markdown";\nconst x = await import(\'./chunk.js\');',
    );
    build.set('preload/index.cjs', 'const { ipcRenderer } = require("electron");\nrequire("vue");');
    // The renderer is a browser bundle: its strings aren't loaded from node_modules.
    build.set('renderer/assets/index.js', 'import x from "vue";');
    expect(appBuildProblems(build)).toEqual([
      'out/main/index.js loads "@lezer/markdown" at run time: bundle it (the app has no node_modules)',
      'out/preload/index.cjs loads "vue" at run time: bundle it (the app has no node_modules)',
    ]);
  });

  it('looks for the marker the harness actually writes', () => {
    const harness = readFileSync(new URL('../src/ui-harness/harness.ts', import.meta.url), 'utf8');
    expect(harness).toContain(`export const HARNESS_MARKER = '${HARNESS_MARKER}';`);
  });
});
