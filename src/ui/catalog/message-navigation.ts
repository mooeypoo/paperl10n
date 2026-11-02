// SPDX-License-Identifier: GPL-3.0-or-later

/** Toward the end of the list (`1`) or its start (`-1`). */
export type Step = 1 | -1;

/**
 * The first row after `from` in the direction of `step` that `matches` (any row, by default), or
 * `null` at the end of the list: moving never wraps around, so the translator knows they're done.
 * From `null` (no row open), going down starts at the top and going up at the bottom.
 */
export function stepTo(
  count: number,
  from: number | null,
  step: Step,
  matches: (index: number) => boolean = () => true,
): number | null {
  let index = from ?? (step === 1 ? -1 : count);
  for (index += step; index >= 0 && index < count; index += step) {
    if (matches(index)) return index;
  }
  return null;
}
