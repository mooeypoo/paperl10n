// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every MarkdownParser must have, stated once (docs/domains/document.md).
import { describe, expect, it } from 'vitest';
import type { MarkdownParser } from '../application/ports/markdown-parser.ts';
import { parsedDocumentProblems, type ParsedDocument } from '../domain/parsed-document.ts';

const RLM = '\u200F';
const BOM = '\uFEFF';

/** Documents that stress the guarantees: line endings, BOM, bidi marks, dialects. */
export const tricky: Readonly<Record<string, string>> = {
  empty: '',
  'only whitespace': '\n\n  \n',
  'headings and paragraphs': '# Title\n\nIntro text.\n\n## Install\n\nRun it.\n',
  'setext heading': 'Title\n=====\n\nText\n',
  CRLF: '# Title\r\n\r\nPara one\r\nline two\r\n\r\n- a\r\n- b\r\n',
  'BOM before a heading': `${BOM}# Title\n\ntext\n`,
  'YAML frontmatter': '---\ntitle: Hello\n# a comment\n---\n\n# Hello\n',
  'TOML frontmatter': '+++\ntitle = "Hello"\n+++\nText\n',
  'BOM and frontmatter': `${BOM}---\ntitle: x\n---\n# H\n`,
  'unclosed frontmatter': '---\ntitle: x\n\nText\n',
  'frontmatter only': '---\ntitle: x\n---\n',
  'RLM and Hebrew with inline code': `${RLM}Lantern הופך את \`docs/\` לאתר.\n`,
  'emoji (surrogate pairs) before a heading': '😀 smile\n\n## Next\n',
  'code fence with info': '```sh\nnpm install\n```\n',
  'indented code': '    code line\n\nafter\n',
  'nested list': '- a\n  - b\n- c\n',
  'GFM table': '| a | b |\n|---|---|\n| 1 | 2 |\n',
  'VitePress container': '::: tip\nStuck? See [the CLI](../cli.md).\n:::\n',
  'Starlight aside': ':::note[Heads up]\nText\n:::\n',
  'HTML and components': '<Badge type="tip" text="New" />\n\nText\n',
  'HTML block': '<div class="note">\n\nText\n',
  'tabs and trailing spaces': '# Title  \n\n\ttabbed code\n',
  'no trailing newline': '# Title\n\nlast line',
  'link reference definition': 'See [docs][d].\n\n[d]: https://example.org\n',
};

/** Block kinds (with heading depth) of each tricky document, in order. */
const expectedKinds: Readonly<Record<string, readonly string[]>> = {
  empty: [],
  'only whitespace': [],
  'headings and paragraphs': ['heading1', 'paragraph', 'heading2', 'paragraph'],
  'setext heading': ['heading1', 'paragraph'],
  CRLF: ['heading1', 'paragraph', 'list'],
  'BOM before a heading': ['heading1', 'paragraph'],
  'YAML frontmatter': ['frontmatter', 'heading1'],
  'TOML frontmatter': ['frontmatter', 'paragraph'],
  'BOM and frontmatter': ['frontmatter', 'heading1'],
  'unclosed frontmatter': ['thematic-break', 'paragraph', 'paragraph'],
  'frontmatter only': ['frontmatter'],
  'RLM and Hebrew with inline code': ['paragraph'],
  'emoji (surrogate pairs) before a heading': ['paragraph', 'heading2'],
  'code fence with info': ['code'],
  'indented code': ['code', 'paragraph'],
  'nested list': ['list'],
  'GFM table': ['table'],
  'VitePress container': ['container-fence', 'paragraph', 'container-fence'],
  'Starlight aside': ['container-fence', 'paragraph', 'container-fence'],
  // A component alone on a line is a paragraph holding an inline tag (lezer only treats known HTML
  // block tags, like <div>, as HTML blocks); the tag itself is marked as markup (test below).
  'HTML and components': ['paragraph', 'paragraph'],
  'HTML block': ['html', 'paragraph'],
  'tabs and trailing spaces': ['heading1', 'code'],
  'no trailing newline': ['heading1', 'paragraph'],
  'link reference definition': ['paragraph', 'link-definition'],
};

const kinds = (document: ParsedDocument) =>
  document.blocks.map((block) =>
    block.kind === 'heading' ? `heading${String(block.depth)}` : block.kind,
  );
const sliceOf = (document: ParsedDocument, index: number) => {
  const block = document.blocks[index];
  return block === undefined ? undefined : document.text.slice(block.range.start, block.range.end);
};
const spansOf = (document: ParsedDocument, kind: string) =>
  document.inline
    .filter((span) => span.kind === kind)
    .map((span) => document.text.slice(span.range.start, span.range.end));

export function describeMarkdownParserContract(name: string, parser: MarkdownParser): void {
  const parse = (text: string, mdx = false) => parser.parse(text, { mdx });

  describe(`MarkdownParser contract: ${name}`, () => {
    describe.each(Object.entries(tricky))('%s', (label, text) => {
      it('keeps the text exactly and satisfies every block and span invariant', () => {
        const document = parse(text);
        expect(document.text).toBe(text);
        expect(parsedDocumentProblems(document)).toEqual([]);
      });

      it('finds the expected blocks', () => {
        expect(kinds(parse(text))).toEqual(expectedKinds[label]);
      });

      it('gives the same result every time (stable segmentation)', () => {
        expect(parse(text)).toEqual(parse(text));
      });
    });

    it('measures offsets in UTF-16 code units', () => {
      const document = parse(tricky['emoji (surrogate pairs) before a heading'] ?? '');
      expect(document.blocks[1]?.range.start).toBe('😀 smile\n\n'.length);
      expect(sliceOf(document, 1)).toBe('## Next');
    });

    it('keeps bidi marks inside the block, untouched', () => {
      const document = parse(tricky['RLM and Hebrew with inline code'] ?? '');
      expect(sliceOf(document, 0)?.startsWith(RLM)).toBe(true);
      expect(spansOf(document, 'code')).toEqual(['docs/']);
    });

    it('leaves a BOM outside every block', () => {
      expect(parse(tricky['BOM before a heading'] ?? '').blocks[0]?.range.start).toBe(1);
      expect(parse(tricky['BOM and frontmatter'] ?? '').blocks[0]?.range.start).toBe(1);
    });

    it('keeps line endings out of blocks, including CR in CRLF files', () => {
      const document = parse(tricky.CRLF ?? '');
      expect(sliceOf(document, 1)).toBe('Para one\r\nline two');
    });

    it('marks syntax, inline code, and link destinations', () => {
      const document = parse('## Run `npx lantern` and read [the guide](./guide.md) **now**.\n');
      expect(spansOf(document, 'markup')).toEqual(['##', '`', '`', '[', ']', '(', ')', '**', '**']);
      expect(spansOf(document, 'code')).toEqual(['npx lantern']);
      expect(spansOf(document, 'url')).toEqual(['./guide.md']);
    });

    it('marks the contents of code blocks as code, and their fences as markup', () => {
      const document = parse(tricky['code fence with info'] ?? '');
      expect(spansOf(document, 'markup')).toEqual(['```', 'sh', '```']);
      expect(spansOf(document, 'code')).toEqual(['npm install']);
    });

    it('treats MDX import and export lines as opaque blocks, only in MDX mode', () => {
      const text = "import Card from './Card.astro';\nexport const x = 1;\n\n# Title\n";
      expect(kinds(parse(text, true))).toEqual(['mdx-esm', 'heading1']);
      expect(sliceOf(parse(text, true), 0)).toBe(
        "import Card from './Card.astro';\nexport const x = 1;",
      );
      expect(kinds(parse(text, false))).toEqual(['paragraph', 'heading1']);
    });

    it('marks inline HTML and components as markup', () => {
      const document = parse('Read <kbd>Ctrl</kbd> or <Badge text="New" /> now.\n');
      expect(spansOf(document, 'markup')).toEqual(['<kbd>', '</kbd>', '<Badge text="New" />']);
    });

    it('finds headings inside containers', () => {
      const document = parse(':::caution\n## Careful\n\nText\n:::\n');
      expect(kinds(document)).toEqual([
        'container-fence',
        'heading2',
        'paragraph',
        'container-fence',
      ]);
    });
  });
}
