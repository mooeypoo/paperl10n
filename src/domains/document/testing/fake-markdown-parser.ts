// SPDX-License-Identifier: GPL-3.0-or-later
import type { MarkdownParseOptions, MarkdownParser } from '../application/ports/markdown-parser.ts';
import type { ParsedDocument } from '../domain/parsed-document.ts';

/** A parser for use-case tests: the whole (trimmed) text is one paragraph. Records each call. */
export class FakeMarkdownParser implements MarkdownParser {
  readonly calls: { text: string; options: MarkdownParseOptions }[] = [];

  parse(text: string, options: MarkdownParseOptions): ParsedDocument {
    this.calls.push({ text, options });
    const start = text.length - text.trimStart().length;
    const end = text.trimEnd().length;
    return {
      text,
      blocks: end > start ? [{ kind: 'paragraph', range: { start, end } }] : [],
      inline: [],
    };
  }
}
