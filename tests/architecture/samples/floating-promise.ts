// SPDX-License-Identifier: GPL-3.0-or-later
// Deliberately broken: tests/architecture/boundaries.test.ts expects lint to report this.
async function load(): Promise<number> {
  await Promise.resolve();
  return 1;
}

export function caller(): void {
  load();
}
