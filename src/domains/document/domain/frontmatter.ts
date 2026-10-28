// SPDX-License-Identifier: GPL-3.0-or-later
import type { TextRange } from '#kernel/text-range';

export interface FrontmatterLocation {
  readonly format: 'yaml' | 'toml';
  /** From the opening fence through the closing fence, without the line ending after it. */
  readonly range: TextRange;
  /** Where the Markdown body starts (after the closing fence's line ending). */
  readonly bodyStart: number;
}

const fences = { '---': 'yaml', '+++': 'toml' } as const;

/**
 * Finds a frontmatter block at the very start of a document (after an optional BOM): a line that
 * is exactly `---` (YAML) or `+++` (TOML), up to the next line that is exactly the same fence.
 * Unclosed means there's no frontmatter: the text is all Markdown.
 */
export function findFrontmatter(text: string): FrontmatterLocation | null {
  const start = text.startsWith('\uFEFF') ? 1 : 0;
  const firstLineEnd = lineEnd(text, start);
  const fence = text.slice(start, firstLineEnd).replace(/\r$/, '');
  if (fence !== '---' && fence !== '+++') return null;

  let lineStart = nextLine(text, firstLineEnd);
  while (lineStart < text.length) {
    const end = lineEnd(text, lineStart);
    const line = text.slice(lineStart, end).replace(/\r$/, '');
    if (line === fence) {
      const closeEnd = lineStart + fence.length;
      return {
        format: fences[fence],
        range: { start, end: closeEnd },
        bodyStart: nextLine(text, end),
      };
    }
    lineStart = nextLine(text, end);
  }
  return null;
}

function lineEnd(text: string, from: number): number {
  const newline = text.indexOf('\n', from);
  return newline === -1 ? text.length : newline;
}

function nextLine(text: string, end: number): number {
  return Math.min(text.length, end + 1);
}
