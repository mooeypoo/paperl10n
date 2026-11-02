// SPDX-License-Identifier: GPL-3.0-or-later

/** Rows `[start, end)` of a list to render: those in view, and `overscan` more on each side. */
export interface RowWindow {
  readonly start: number;
  readonly end: number;
}

/** The one row that's open, and so taller than the others: its index and height in pixels. */
export interface OpenRow {
  readonly index: number;
  readonly height: number;
}

/** The open row, when it's taller than a row (a shorter one counts as a row). */
function tallRow(rowHeight: number, open: OpenRow | null): OpenRow | null {
  return open !== null && open.index >= 0 && open.height > rowHeight ? open : null;
}

/** Where row `index` starts, in pixels from the list's top (the row count: where it ends). */
export function rowTop(index: number, rowHeight: number, open: OpenRow | null = null): number {
  const tall = tallRow(rowHeight, open);
  return index * rowHeight + (tall !== null && index > tall.index ? tall.height - rowHeight : 0);
}

/** A row's height in pixels. */
export function rowHeightOf(index: number, rowHeight: number, open: OpenRow | null = null): number {
  return tallRow(rowHeight, open)?.index === index ? (open?.height ?? 0) : rowHeight;
}

/** Where `offset` falls, in rows: 2.5 is halfway down the third row. */
function rowPosition(offset: number, rowHeight: number, tall: OpenRow | null): number {
  if (tall === null) return offset / rowHeight;
  const openTop = tall.index * rowHeight;
  const openEnd = openTop + tall.height;
  if (offset < openTop) return offset / rowHeight;
  if (offset < openEnd) return tall.index + (offset - openTop) / tall.height;
  return tall.index + 1 + (offset - openEnd) / rowHeight;
}

/**
 * The rows of a list of fixed-height rows that are in view in a box scrolled to `scrollTop` and
 * `viewport` pixels high, plus `overscan` rows on each side. Every row is the same height but the
 * open one, so it's arithmetic, never a measurement per row.
 */
export function visibleRows(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  overscan: number,
  open: OpenRow | null = null,
): RowWindow {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const tall = tallRow(rowHeight, open);
  const top = Math.max(0, scrollTop);
  const first = Math.floor(rowPosition(top, rowHeight, tall));
  const last = Math.ceil(rowPosition(top + Math.max(0, viewport), rowHeight, tall));
  const start = Math.min(count, Math.max(0, first - overscan));
  return { start, end: Math.min(count, Math.max(start, last + overscan)) };
}

/**
 * Where to scroll so row `index` is in view: unchanged when it already is; else its top at the
 * view's top (going up, or a row taller than the view) or its bottom at the view's bottom.
 */
export function scrollToShow(
  index: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  open: OpenRow | null = null,
): number {
  const top = rowTop(index, rowHeight, open);
  const bottom = top + rowHeightOf(index, rowHeight, open);
  if (top < scrollTop || bottom - top > viewport) return top;
  if (bottom > scrollTop + viewport) return bottom - viewport;
  return scrollTop;
}
