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

/**
 * The frontmatter's top-level keys, in order: YAML `key:` lines without indentation, or TOML
 * `key =` lines and `[table]` headers. Comments, list items, and nested keys aren't keys. Quoted
 * keys are read without their quotes.
 */
export function frontmatterKeys(
  text: string,
  location: FrontmatterLocation,
): { readonly name: string; readonly range: TextRange }[] {
  const keys: { name: string; range: TextRange }[] = [];
  const pattern =
    location.format === 'yaml'
      ? /^(?:"([^"\n]+)"|'([^'\n]+)'|([^\s#:'"\-[{][^:\n]*?)):(?=\s|$)/
      : /^(?:\[\[?([^\]\n]+)\]\]?|"([^"\n]+)"|([A-Za-z0-9_.-]+))\s*(?:=|$)/;
  // The lines between the fences.
  let lineStart = nextLine(text, lineEnd(text, location.range.start));
  const closing = location.range.end - 3;
  while (lineStart < closing) {
    const end = lineEnd(text, lineStart);
    const line = text.slice(lineStart, end).replace(/\r$/, '');
    const match = pattern.exec(line);
    const name = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
    if (match !== null && name !== undefined && name !== '') {
      const keyEnd = lineStart + match[0].replace(/\s*[:=]?$/, '').length;
      keys.push({ name, range: { start: lineStart, end: keyEnd } });
    }
    lineStart = nextLine(text, end);
  }
  return keys;
}

function lineEnd(text: string, from: number): number {
  const newline = text.indexOf('\n', from);
  return newline === -1 ? text.length : newline;
}

function nextLine(text: string, end: number): number {
  return Math.min(text.length, end + 1);
}
