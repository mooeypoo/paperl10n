// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A span of a text, as offsets in UTF-16 code units (JavaScript string indices, the unit editors
 * use). `start` is inclusive, `end` exclusive, so `text.slice(start, end)` is the span.
 */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export function textRange(start: number, end: number): TextRange {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new RangeError(`invalid text range [${String(start)}, ${String(end)})`);
  }
  return { start, end };
}

export function sliceRange(text: string, range: TextRange): string {
  return text.slice(range.start, range.end);
}
