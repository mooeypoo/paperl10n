// SPDX-License-Identifier: GPL-3.0-or-later
import { posix } from 'node:path';

/**
 * The self-contained unit a source file belongs to, or `undefined` outside `src/`'s units.
 * Relative imports must stay within a unit; anything else goes through a `#` alias.
 * Paths are project-relative with `/` separators.
 */
export function unitOf(path: string): string | undefined {
  const match =
    /^src\/(domains\/[^/]+|plugins\/[^/]+|shared\/kernel)\//.exec(path) ??
    /^src\/(shared\/ipc-contract)\.ts$/.exec(path) ??
    /^src\/(app|main|preload|ui)\//.exec(path);
  return match?.[1];
}

/** Resolves a relative import specifier against the importing file. Both are project-relative. */
export function resolveRelative(fromFile: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(fromFile), specifier));
}

/** The alias a cross-unit import should use instead, if there's an obvious one. */
export function aliasHint(unit: string): string {
  if (unit.startsWith('domains/')) return `#${unit}`;
  if (unit === 'shared/kernel') return '#kernel/<module>';
  if (unit === 'shared/ipc-contract') return '#ipc-contract';
  if (unit.startsWith('plugins/')) return `#${unit} (only from src/app/)`;
  return 'a # alias';
}
