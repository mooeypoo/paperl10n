// SPDX-License-Identifier: GPL-3.0-or-later
// A Markdown document as read: its exact text, the blocks it's made of, and where its inline
// syntax is. Positions only, never a re-printed tree: edits will be splices at these offsets
// (docs/domains/document.md), so an unedited document is always its original text, byte for byte.
import type { TextRange } from '#kernel/text-range';

/** The top-level structural units of a document. */
export const blockKinds = [
  'frontmatter',
  'heading',
  'paragraph',
  'list',
  'blockquote',
  'code',
  'table',
  'html',
  'thematic-break',
  'link-definition',
  /** A `:::` line opening or closing a container (VitePress `::: tip`, Starlight `:::note`). */
  'container-fence',
  /** MDX `import`/`export` lines, kept as opaque text. */
  'mdx-esm',
] as const;

export type BlockKind = (typeof blockKinds)[number];

export interface Block {
  readonly kind: BlockKind;
  /** The block's text, without its trailing line ending. */
  readonly range: TextRange;
  /** Headings only: 1–6. */
  readonly depth?: number;
}

/** Inline parts of the text that a view styles differently from prose. */
export type InlineKind =
  /** Syntax characters: `#`, `**`, `[`, `](`, `` ` ``, list markers, code fences. */
  | 'markup'
  /** Inline code and the contents of code blocks. */
  | 'code'
  /** Link and image destinations. */
  | 'url';

export interface InlineSpan {
  readonly kind: InlineKind;
  readonly range: TextRange;
}

/** Things a translation usually keeps as they are (PRD §6, preservation hints). */
export type PreservedKind =
  /** A fenced or indented code block; its value is the fence's language (`''`: none). */
  | 'code-block'
  /** A link's target: inline, autolink, or a link definition's (`[ref]: /x`). */
  | 'link'
  /** An image's target. */
  | 'image'
  /** An opening HTML or MDX component tag, by name (`Badge`, `img`). */
  | 'component'
  /** A top-level frontmatter key. */
  | 'frontmatter-key';

export interface PreservedElement {
  readonly kind: PreservedKind;
  readonly range: TextRange;
  /** What's compared: the language, the target, or the name (see `PreservedKind`). */
  readonly value: string;
}

export interface ParsedDocument {
  readonly text: string;
  /** In order, never overlapping. Only whitespace (or a leading BOM) lies between them. */
  readonly blocks: readonly Block[];
  /** In order, never overlapping, each inside a block. */
  readonly inline: readonly InlineSpan[];
  /** In order of their start, each inside a block (an image may sit inside a link). */
  readonly preserved: readonly PreservedElement[];
}

/**
 * What every parsed document must satisfy, as a list of problems (empty when it's valid). The
 * parser contract suite checks every parser's output with it.
 */
export function parsedDocumentProblems(document: ParsedDocument): string[] {
  const problems: string[] = [];
  const { text, blocks, inline, preserved } = document;
  let previousEnd = 0;
  blocks.forEach((block, index) => {
    const { start, end } = block.range;
    const where = `block ${String(index)} (${block.kind} [${String(start)}, ${String(end)}))`;
    if (start < previousEnd) problems.push(`${where} overlaps or precedes the previous block`);
    if (end > text.length) problems.push(`${where} ends past the text`);
    if (end <= start) problems.push(`${where} is empty`);
    const gap = text.slice(previousEnd, start).replace(/^\uFEFF/, '');
    if (gap.trim() !== '') problems.push(`${where} leaves non-whitespace text before it`);
    if (/\r?\n$/.test(text.slice(start, end))) problems.push(`${where} includes its line ending`);
    if ((block.kind === 'heading') !== (block.depth !== undefined)) {
      problems.push(`${where}: only headings have a depth`);
    }
    previousEnd = Math.max(previousEnd, end);
  });
  if (text.slice(previousEnd).trim() !== '')
    problems.push('non-whitespace text after the last block');

  let previousSpanEnd = 0;
  inline.forEach((span, index) => {
    const { start, end } = span.range;
    const where = `inline ${String(index)} (${span.kind} [${String(start)}, ${String(end)}))`;
    if (start < previousSpanEnd) problems.push(`${where} overlaps or precedes the previous span`);
    if (end <= start) problems.push(`${where} is empty`);
    if (!blocks.some((block) => block.range.start <= start && end <= block.range.end)) {
      problems.push(`${where} isn't inside a block`);
    }
    previousSpanEnd = end;
  });

  let previousStart = 0;
  preserved.forEach((element, index) => {
    const { start, end } = element.range;
    const where = `preserved ${String(index)} (${element.kind} [${String(start)}, ${String(end)}))`;
    if (start < previousStart) problems.push(`${where} starts before the previous one`);
    if (end <= start) problems.push(`${where} is empty`);
    if (!blocks.some((block) => block.range.start <= start && end <= block.range.end)) {
      problems.push(`${where} isn't inside a block`);
    }
    previousStart = start;
  });
  return problems;
}
