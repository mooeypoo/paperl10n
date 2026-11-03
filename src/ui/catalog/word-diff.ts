// SPDX-License-Identifier: GPL-3.0-or-later
// What changed between a message's source when it was translated and its source now (gettext's
// `#|`), word by word, for the open message to show. Whitespace runs are words too, so the
// segments join back into either text.

/** A run of text the old and new source share, or one only one of them has. */
export interface DiffSegment {
  readonly kind: 'same' | 'removed' | 'added';
  readonly text: string;
}

/** Words and the whitespace between them, in order. */
const words = (text: string) => text.split(/(\s+)/).filter((part) => part !== '');

/**
 * The segments turning `before` into `after`: a longest common subsequence of their words, with
 * what's only in `before` removed and what's only in `after` added (removals first where both
 * change). Neighboring segments of one kind are joined.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = words(before);
  const b = words(after);
  // lengths[i][j]: the longest common subsequence of a[i…] and b[j…].
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lengths[i];
      if (row === undefined) continue;
      row[j] =
        a[i] === b[j]
          ? (lengths[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lengths[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const segments: DiffSegment[] = [];
  const push = (kind: DiffSegment['kind'], text: string) => {
    const last = segments[segments.length - 1];
    if (last?.kind === kind) segments[segments.length - 1] = { kind, text: last.text + text };
    else segments.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i] ?? '');
      i++;
      j++;
    } else if (
      j >= b.length ||
      (i < a.length && (lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0))
    ) {
      push('removed', a[i] ?? '');
      i++;
    } else {
      push('added', b[j] ?? '');
      j++;
    }
  }
  return segments;
}
