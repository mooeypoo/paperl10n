// SPDX-License-Identifier: GPL-3.0-or-later
export async function probe(): Promise<number> {
  await Promise.resolve();
  return 1;
}

export function caller(): void {
  probe();
}
