// SPDX-License-Identifier: GPL-3.0-or-later
// Lining up two sequences: the longest common subsequence, then what's left between its matches.

/** One step through two sequences, in order. */
export type Step =
  /** Equal items, kept by both. */
  | { readonly kind: 'same'; readonly before: number; readonly after: number }
  /** Only in `after`: added. */
  | { readonly kind: 'added'; readonly after: number }
  /** Only in `before`: removed. */
  | { readonly kind: 'removed'; readonly before: number };

/**
 * How `before` became `after`: their longest common subsequence as `same` steps, and between
 * those, what was added, then what was removed (in that order, so a replaced item's old version
 * follows its new one). When several alignments are as long, earlier items match first.
 */
export function alignSequences<T>(
  before: readonly T[],
  after: readonly T[],
  equal: (a: T, b: T) => boolean = Object.is,
): Step[] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  // lengths[i * columns + j]: the LCS length of before[i..] and after[j..].
  const lengths = new Uint32Array(rows * columns);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const a = before[i] as T;
      const b = after[j] as T;
      lengths[i * columns + j] = equal(a, b)
        ? (lengths[(i + 1) * columns + j + 1] ?? 0) + 1
        : Math.max(lengths[(i + 1) * columns + j] ?? 0, lengths[i * columns + j + 1] ?? 0);
    }
  }
  const steps: Step[] = [];
  let added: Step[] = [];
  let removed: Step[] = [];
  const flush = () => {
    steps.push(...added, ...removed);
    added = [];
    removed = [];
  };
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    // Matching equal items is always part of a longest common subsequence.
    if (i < before.length && j < after.length && equal(before[i] as T, after[j] as T)) {
      flush();
      steps.push({ kind: 'same', before: i, after: j });
      i++;
      j++;
      continue;
    }
    const here = lengths[i * columns + j] ?? 0;
    if (i < before.length && (lengths[(i + 1) * columns + j] ?? 0) === here) {
      removed.push({ kind: 'removed', before: i });
      i++;
    } else {
      added.push({ kind: 'added', after: j });
      j++;
    }
  }
  flush();
  return steps;
}
