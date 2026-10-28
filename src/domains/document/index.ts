// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `document` domain: longform Markdown documents, frontmatter, and block
// segmentation. Other domains import this file only, as `#domains/document`.
export {
  documentKey,
  type DocumentKey,
  type InvalidDocumentKey,
  type SourceDocument,
} from './domain/source-document.ts';
export {
  blockKinds,
  parsedDocumentProblems,
  type Block,
  type BlockKind,
  type InlineKind,
  type InlineSpan,
  type ParsedDocument,
} from './domain/parsed-document.ts';
export { findFrontmatter, type FrontmatterLocation } from './domain/frontmatter.ts';
export type { MarkdownParseOptions, MarkdownParser } from './application/ports/markdown-parser.ts';
