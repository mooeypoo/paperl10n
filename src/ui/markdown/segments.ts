// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a document's blocks and inline spans into styled runs of text, for the "Markdown as
// written" view. No HTML is ever produced from the document: the view renders these as text.
import type { BlockDto, DocumentTextDto, InlineSpanDto } from '#ipc-contract';

export type SegmentKind = 'text' | InlineSpanDto['kind'];

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}

export interface BlockView {
  readonly block: BlockDto;
  readonly segments: readonly Segment[];
}

/** The block's text as runs: inline spans inside it in their own kind, everything else `text`. */
export function segmentBlock(
  text: string,
  block: BlockDto,
  spans: readonly InlineSpanDto[],
): Segment[] {
  const segments: Segment[] = [];
  let position = block.start;
  const push = (kind: SegmentKind, end: number) => {
    if (end > position) segments.push({ kind, text: text.slice(position, end) });
    position = Math.max(position, end);
  };
  for (const span of spans) {
    if (span.end <= block.start || span.start >= block.end) continue;
    push('text', Math.max(span.start, block.start));
    push(span.kind, Math.min(span.end, block.end));
  }
  push('text', block.end);
  return segments;
}

/** Every block of a document with its runs, in order. Spans are sorted, so one pass suffices. */
export function blockViews(document: DocumentTextDto): BlockView[] {
  let next = 0;
  return document.blocks.map((block) => {
    while (next < document.inline.length && (document.inline[next]?.end ?? 0) <= block.start)
      next++;
    const inside: InlineSpanDto[] = [];
    for (let i = next; i < document.inline.length; i++) {
      const span = document.inline[i];
      if (span === undefined || span.start >= block.end) break;
      inside.push(span);
    }
    return { block, segments: segmentBlock(document.text, block, inside) };
  });
}

/**
 * Blocks whose text is code, data, or markup (HTML and components), so it reads left to right
 * whatever the pane's language, line by line: a line that starts with prose in a right-to-left
 * language still reads right to left (the view sets `unicode-bidi: plaintext`).
 */
export function isLeftToRightBlock(block: BlockDto): boolean {
  return (
    block.kind === 'code' ||
    block.kind === 'frontmatter' ||
    block.kind === 'mdx-esm' ||
    block.kind === 'html'
  );
}

/**
 * Inline runs that must read left to right as one isolated unit, so the bidi algorithm can't
 * scatter them through a right-to-left sentence: inline code, link destinations, and markup that
 * contains letters (HTML tags and components like `<Badge text="New" />`). Punctuation-only markup
 * (`**`, `[`, `](`) stays neutral and takes the sentence's direction. Only in prose: code and data
 * blocks handle direction line by line instead.
 */
export function isolatesLeftToRight(segment: Segment, block: BlockDto): boolean {
  if (isLeftToRightBlock(block)) return false;
  return (
    segment.kind === 'code' ||
    segment.kind === 'url' ||
    (segment.kind === 'markup' && /\p{L}/u.test(segment.text))
  );
}
