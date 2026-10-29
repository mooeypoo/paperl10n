// SPDX-License-Identifier: GPL-3.0-or-later
// The MarkdownParser port on @lezer/markdown, CodeMirror 6's own parser, configured once in
// #markdown-syntax so the reading model and the editor see the same blocks (ADR 0017). Lezer's tree
// is mapped to our model here and nowhere else.
import type { SyntaxNodeRef, Tree } from '@lezer/common';
import { markdownSyntax } from '#markdown-syntax';
import { findFrontmatter } from '../domain/frontmatter.ts';
import type {
  Block,
  BlockKind,
  InlineKind,
  InlineSpan,
  ParsedDocument,
} from '../domain/parsed-document.ts';
import type { MarkdownParser } from '../application/ports/markdown-parser.ts';

const blockKindOf: Readonly<Record<string, BlockKind>> = {
  Paragraph: 'paragraph',
  BulletList: 'list',
  OrderedList: 'list',
  Blockquote: 'blockquote',
  FencedCode: 'code',
  CodeBlock: 'code',
  HTMLBlock: 'html',
  CommentBlock: 'html',
  ProcessingInstructionBlock: 'html',
  HorizontalRule: 'thematic-break',
  LinkReference: 'link-definition',
  Table: 'table',
  ContainerFence: 'container-fence',
  MdxEsm: 'mdx-esm',
};

const inlineKindOf: Readonly<Record<string, InlineKind>> = {
  HeaderMark: 'markup',
  EmphasisMark: 'markup',
  CodeMark: 'markup',
  CodeInfo: 'markup',
  LinkMark: 'markup',
  QuoteMark: 'markup',
  ListMark: 'markup',
  TableDelimiter: 'markup',
  StrikethroughMark: 'markup',
  TaskMarker: 'markup',
  // Inline HTML and components (`<Badge text="New" />`): syntax, not prose.
  HTMLTag: 'markup',
  URL: 'url',
  CodeText: 'code',
};

/** A span's end, moved back over a line ending, so blocks never include their own. */
function withoutLineEnding(text: string, start: number, end: number): number {
  let trimmed = end;
  while (trimmed > start && (text[trimmed - 1] === '\n' || text[trimmed - 1] === '\r')) trimmed--;
  return trimmed;
}

function blockFor(node: SyntaxNodeRef, text: string): Block | null {
  const end = withoutLineEnding(text, node.from, node.to);
  if (end <= node.from) return null;
  const range = { start: node.from, end };
  const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
  if (heading !== null) return { kind: 'heading', range, depth: Number(heading[1]) };
  const kind = blockKindOf[node.name];
  return kind === undefined ? { kind: 'html', range } : { kind, range };
}

function inlineSpans(tree: Tree, text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const add = (kind: InlineKind, start: number, end: number) => {
    const trimmed = withoutLineEnding(text, start, end);
    if (trimmed > start) spans.push({ kind, range: { start, end: trimmed } });
  };
  tree.iterate({
    enter(node) {
      if (node.name === 'InlineCode') {
        // The code between its backtick marks; the marks themselves are visited as CodeMark.
        const marks = node.node.getChildren('CodeMark');
        const open = marks[0];
        const close = marks.at(-1);
        if (open !== undefined && close !== undefined && open !== close)
          add('code', open.to, close.from);
        return;
      }
      const kind = inlineKindOf[node.name];
      if (kind !== undefined) add(kind, node.from, node.to);
    },
  });
  spans.sort((a, b) => a.range.start - b.range.start);
  // Leaves never overlap, but keep the guarantee explicit: the first span wins.
  const ordered: InlineSpan[] = [];
  for (const span of spans) {
    const previous = ordered.at(-1);
    if (previous === undefined || span.range.start >= previous.range.end) ordered.push(span);
  }
  return ordered;
}

export function createLezerMarkdownParser(): MarkdownParser {
  return {
    parse(text, options): ParsedDocument {
      const frontmatter = findFrontmatter(text);
      const blocks: Block[] =
        frontmatter === null ? [] : [{ kind: 'frontmatter', range: frontmatter.range }];
      // Parse only the body (after a BOM or frontmatter), keeping offsets into the whole text.
      const bodyStart = frontmatter?.bodyStart ?? (text.startsWith('\uFEFF') ? 1 : 0);
      if (bodyStart >= text.length) return { text, blocks, inline: [] };

      // Lezer reports positions relative to what it parsed, so shift them into the whole text.
      const body = text.slice(bodyStart);
      const tree = markdownSyntax({ mdx: options.mdx, frontmatter: false }).parse(body);
      const shift = (block: Block): Block => ({
        ...block,
        range: { start: block.range.start + bodyStart, end: block.range.end + bodyStart },
      });
      for (let node = tree.topNode.firstChild; node !== null; node = node.nextSibling) {
        const block = blockFor(node, body);
        if (block !== null) blocks.push(shift(block));
      }
      const inline = inlineSpans(tree, body)
        .map((span) => ({
          ...span,
          range: { start: span.range.start + bodyStart, end: span.range.end + bodyStart },
        }))
        .filter((span) =>
          blocks.some((b) => b.range.start <= span.range.start && span.range.end <= b.range.end),
        );
      return { text, blocks, inline };
    },
  };
}
