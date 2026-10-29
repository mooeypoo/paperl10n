// SPDX-License-Identifier: GPL-3.0-or-later
// The Markdown dialect Paper Lion reads, as one @lezer/markdown configuration shared by the reading
// model (document/adapters) and the editor (ui/), so both see the same blocks (ADR 0017). Lezer
// node names are the vocabulary here; mapping them to the document model stays in the adapter.
import {
  parser as commonMark,
  GFM,
  type Line,
  type MarkdownConfig,
  type MarkdownParser,
} from '@lezer/markdown';

const isContainerFence = (line: Line) => line.text.slice(line.pos).startsWith(':::');

/** `:::` lines (VitePress `::: tip`, Starlight `:::note`) are their own blocks; what's between
 * them parses as ordinary Markdown. */
const containerFences: MarkdownConfig = {
  defineNodes: [{ name: 'ContainerFence', block: true }],
  parseBlock: [
    {
      name: 'ContainerFence',
      before: 'FencedCode',
      parse(cx, line) {
        if (!isContainerFence(line)) return false;
        cx.addElement(
          cx.elt('ContainerFence', cx.lineStart + line.pos, cx.lineStart + line.text.length),
        );
        cx.nextLine();
        return true;
      },
      endLeaf: (_cx, line) => isContainerFence(line),
    },
  ],
};

/** MDX tolerance: top-level `import`/`export` statements, up to the next blank line. */
const mdxEsm: MarkdownConfig = {
  defineNodes: [{ name: 'MdxEsm', block: true }],
  parseBlock: [
    {
      name: 'MdxEsm',
      before: 'IndentedCode',
      parse(cx, line) {
        const topLevel = cx.parentType().name === 'Document';
        if (!topLevel || line.indent !== 0 || !/^(?:import|export)\s/.test(line.text)) {
          return false;
        }
        const from = cx.lineStart;
        let to = from + line.text.length;
        while (cx.nextLine() && line.text.trim() !== '') to = cx.lineStart + line.text.length;
        cx.addElement(cx.elt('MdxEsm', from, to));
        return true;
      },
    },
  ],
};

const withoutCarriageReturn = (text: string) => text.replace(/\r$/, '');

/**
 * Frontmatter, for parsing a whole file (the editor). The fences follow `findFrontmatter` in
 * `document/domain`: a first line (after an optional BOM) that is exactly `---` or `+++`, up to the
 * next line that is exactly the same fence. One deliberate difference: a block parser can't look
 * ahead to the end, so an unclosed fence runs to the end of the text (while typing one, the rest of
 * the file shows as frontmatter until it's closed). The reading model parses only the body after
 * `findFrontmatter`, so it doesn't use this.
 */
const frontmatter: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true }],
  parseBlock: [
    {
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0 || cx.parentType().name !== 'Document') return false;
        const bom = line.text.startsWith('﻿') ? 1 : 0;
        const fence = withoutCarriageReturn(line.text.slice(bom));
        if (fence !== '---' && fence !== '+++') return false;
        let to = bom + fence.length;
        while (cx.nextLine()) {
          const text = withoutCarriageReturn(line.text);
          to = cx.lineStart + text.length;
          if (text === fence) {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt('Frontmatter', bom, to));
        return true;
      },
    },
  ],
};

export interface MarkdownSyntaxOptions {
  /** MDX files: top-level `import`/`export` lines are their own blocks. */
  readonly mdx: boolean;
  /** Parse a leading frontmatter block (whole files) instead of leaving it to the caller. */
  readonly frontmatter: boolean;
}

const parsers = new Map<string, MarkdownParser>();

/** The configured parser for one combination of options (built once, then reused). */
export function markdownSyntax(options: MarkdownSyntaxOptions): MarkdownParser {
  const key = `${String(options.mdx)}:${String(options.frontmatter)}`;
  let configured = parsers.get(key);
  if (configured === undefined) {
    configured = commonMark.configure([
      GFM,
      containerFences,
      ...(options.mdx ? [mdxEsm] : []),
      ...(options.frontmatter ? [frontmatter] : []),
    ]);
    parsers.set(key, configured);
  }
  return configured;
}
