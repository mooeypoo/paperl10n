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
      preserved: [],
    };
  }
}

/**
 * A parser for use-case tests that need sections: each non-blank line is a block, a heading when
 * it starts with `#`s and a space, a paragraph otherwise. Records each call.
 */
export class LineMarkdownParser extends FakeMarkdownParser {
  override parse(text: string, options: MarkdownParseOptions): ParsedDocument {
    super.parse(text, options);
    const blocks: ParsedDocument['blocks'][number][] = [];
    let start = 0;
    for (const line of text.split('\n')) {
      const depth = /^(#{1,6}) /.exec(line)?.[1]?.length;
      const range = { start, end: start + line.trimEnd().length };
      if (line.trim() !== '') {
        blocks.push(
          depth === undefined ? { kind: 'paragraph', range } : { kind: 'heading', range, depth },
        );
      }
      start += line.length + 1;
    }
    return { text, blocks, inline: [], preserved: [] };
  }
}
