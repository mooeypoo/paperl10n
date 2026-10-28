// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The string the UI harness writes into its page (src/ui-harness/harness.ts). The app build must
 * never contain it: the harness is a testing aid, not part of the app (ADR 0015).
 */
export const HARNESS_MARKER = 'paperl10n-ui-harness';

/** Files every app build has; without them there's nothing meaningful to check. */
export const EXPECTED_BUILD_FILES = [
  'main/index.js',
  'preload/index.cjs',
  'renderer/index.html',
] as const;

/** Problems with an app build, given its files (path relative to `out/` → content). */
export function appBuildProblems(files: ReadonlyMap<string, string>): string[] {
  const missing = EXPECTED_BUILD_FILES.filter((path) => !files.has(path)).map(
    (path) => `out/${path} is missing: run \`pnpm build\` first`,
  );
  const withHarness = [...files]
    .filter(([, content]) => content.includes(HARNESS_MARKER))
    .map(([path]) => `out/${path} contains UI harness code ("${HARNESS_MARKER}")`);
  return [...missing, ...withHarness];
}
