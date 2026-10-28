// SPDX-License-Identifier: GPL-3.0-or-later
import type { ParsedDocument } from '../../domain/parsed-document.ts';

export interface MarkdownParseOptions {
  /** Tolerate MDX (`.mdx` files): `import`/`export` lines become opaque blocks. */
  readonly mdx: boolean;
}

/**
 * Splits Markdown into blocks and inline spans, with positions into the original text. Pure and
 * synchronous. Behavior: `describeMarkdownParserContract` (`#domain-testing/document`).
 */
export interface MarkdownParser {
  parse(text: string, options: MarkdownParseOptions): ParsedDocument;
}
