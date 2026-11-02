// SPDX-License-Identifier: GPL-3.0-or-later

/** Rows `[start, end)` of a list to render: those in view, and `overscan` more on each side. */
export interface RowWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * The rows of a list of fixed-height rows that are in view in a box scrolled to `scrollTop` and
 * `viewport` pixels high, plus `overscan` rows on each side. Every row being the same height, it's
 * arithmetic, never a measurement per row.
 */
export function visibleRows(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  overscan: number,
): RowWindow {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewport)) / rowHeight);
  const start = Math.min(count, Math.max(0, first - overscan));
  return { start, end: Math.min(count, Math.max(start, last + overscan)) };
}
