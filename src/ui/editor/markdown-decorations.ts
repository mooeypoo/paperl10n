// SPDX-License-Identifier: GPL-3.0-or-later
// How the editor shows Markdown, from the syntax tree: the same rules as the reading view
// (ui/markdown/segments.ts), applied to lines and ranges instead of blocks.
// - Code, frontmatter, MDX import/export, HTML blocks, container fences, and tables read line by
//   line (`dir="auto"`: each line takes its first strong character's direction), so commands stay
//   left to right and a Hebrew comment still reads right to left.
// - Elsewhere, inline code, URLs, and markup with letters in it (HTML tags, components) are
//   isolated left-to-right runs, so a right-to-left sentence can't scatter them. Punctuation-only
//   markup (`**`, `[`, `](`) stays neutral and takes the sentence's direction (E0 found isolating
//   it breaks bracket mirroring).
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import {
  Decoration,
  Direction,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

interface LineBlock {
  readonly kind: string;
  /** Read line by line (`dir="auto"`). */
  readonly byLine: boolean;
  /** Inline runs inside are isolated (prose); not in code and data, which go line by line. */
  readonly isolates: boolean;
}

const lineBlocks: Readonly<Record<string, LineBlock>> = {
  FencedCode: { kind: 'code', byLine: true, isolates: false },
  CodeBlock: { kind: 'code', byLine: true, isolates: false },
  Frontmatter: { kind: 'frontmatter', byLine: true, isolates: false },
  MdxEsm: { kind: 'frontmatter', byLine: true, isolates: false },
  HTMLBlock: { kind: 'html', byLine: true, isolates: false },
  CommentBlock: { kind: 'html', byLine: true, isolates: false },
  ProcessingInstructionBlock: { kind: 'html', byLine: true, isolates: false },
  ContainerFence: { kind: 'container-fence', byLine: true, isolates: false },
  Table: { kind: 'table', byLine: true, isolates: true },
};

const markup = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'QuoteMark',
  'ListMark',
  'TableDelimiter',
  'StrikethroughMark',
  'TaskMarker',
  'HTMLTag',
]);

/** Text that looks a certain way, marks included (live-preview.ts may hide the marks). */
const textLooks: Readonly<Record<string, 'strong' | 'emphasis' | 'strikethrough'>> = {
  StrongEmphasis: 'strong',
  Emphasis: 'emphasis',
  Strikethrough: 'strikethrough',
};

export interface LineStyle {
  /** The line's start. */
  readonly from: number;
  readonly classes: readonly string[];
  readonly byLine: boolean;
}

export interface MarkStyle {
  readonly from: number;
  readonly to: number;
  readonly kind: 'markup' | 'url' | 'code' | 'strong' | 'emphasis' | 'strikethrough';
}

export interface MarkdownStyles {
  readonly lines: readonly LineStyle[];
  readonly marks: readonly MarkStyle[];
  /** Left-to-right isolated runs, in order, never overlapping. */
  readonly isolates: readonly { readonly from: number; readonly to: number }[];
}

/** The styles for the lines and text between `from` and `to` (the visible part, usually). */
export function markdownStyles(state: EditorState, from: number, to: number): MarkdownStyles {
  const { doc } = state;
  const lines = new Map<number, { classes: Set<string>; byLine: boolean }>();
  const styleLines = (start: number, end: number, classes: string[], byLine: boolean) => {
    const first = doc.lineAt(Math.max(start, from));
    const last = doc.lineAt(Math.min(end, to));
    for (let number = first.number; number <= last.number; number++) {
      const line = doc.line(number);
      const style = lines.get(line.from) ?? { classes: new Set<string>(), byLine: false };
      for (const name of classes) style.classes.add(name);
      if (byLine) style.byLine = true;
      lines.set(line.from, style);
    }
  };
  const marks: MarkStyle[] = [];
  const isolates: { from: number; to: number }[] = [];
  // Inside code and data blocks, nothing is isolated: the lines handle direction.
  let noIsolation = 0;
  const isolate = (start: number, end: number) => {
    if (noIsolation > 0) return;
    const previous = isolates.at(-1);
    if (previous === undefined || start >= previous.to) isolates.push({ from: start, to: end });
  };

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      const block = lineBlocks[node.name];
      if (block !== undefined) {
        styleLines(node.from, node.to, [`cm-md-${block.kind}`], block.byLine);
        if (!block.isolates) noIsolation++;
        return;
      }
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
      if (heading !== null) {
        styleLines(node.from, node.to, ['cm-md-heading', `cm-md-h${heading[1] ?? ''}`], false);
        return;
      }
      if (node.to <= node.from) return;
      const look = textLooks[node.name];
      if (look !== undefined) {
        marks.push({ from: node.from, to: node.to, kind: look });
      } else if (node.name === 'InlineCode') {
        marks.push({ from: node.from, to: node.to, kind: 'code' });
        isolate(node.from, node.to);
      } else if (node.name === 'URL') {
        marks.push({ from: node.from, to: node.to, kind: 'url' });
        isolate(node.from, node.to);
      } else if (markup.has(node.name)) {
        marks.push({ from: node.from, to: node.to, kind: 'markup' });
        if (/\p{L}/u.test(doc.sliceString(node.from, node.to))) isolate(node.from, node.to);
      }
    },
    leave: (node) => {
      const block = lineBlocks[node.name];
      if (block !== undefined && !block.isolates) noIsolation--;
    },
  });

  return {
    lines: [...lines]
      .sort(([a], [b]) => a - b)
      .map(([start, style]) => ({
        from: start,
        classes: [...style.classes],
        byLine: style.byLine,
      })),
    marks,
    isolates,
  };
}

const markDecorations = {
  markup: Decoration.mark({ class: 'cm-md-markup' }),
  url: Decoration.mark({ class: 'cm-md-url' }),
  code: Decoration.mark({ class: 'cm-md-inline-code' }),
  strong: Decoration.mark({ class: 'cm-md-strong' }),
  emphasis: Decoration.mark({ class: 'cm-md-emphasis' }),
  strikethrough: Decoration.mark({ class: 'cm-md-strikethrough' }),
};
const isolateDecoration = Decoration.mark({
  bidiIsolate: Direction.LTR,
  attributes: { dir: 'ltr' },
  class: 'cm-md-isolate',
});

function decorate(view: EditorView): { styles: DecorationSet; isolates: DecorationSet } {
  const { from, to } = view.viewport;
  const styles = markdownStyles(view.state, from, to);
  const ranges: Range<Decoration>[] = [
    ...styles.lines.map((line) =>
      Decoration.line({
        class: line.classes.join(' '),
        ...(line.byLine ? { attributes: { dir: 'auto' } } : {}),
      }).range(line.from),
    ),
    ...styles.marks.map((mark) => markDecorations[mark.kind].range(mark.from, mark.to)),
  ];
  return {
    styles: Decoration.set(ranges, true),
    isolates: Decoration.set(
      styles.isolates.map((run) => isolateDecoration.range(run.from, run.to)),
      true,
    ),
  };
}

const markdownView = ViewPlugin.fromClass(
  class {
    styles: DecorationSet;
    isolates: DecorationSet;
    constructor(view: EditorView) {
      ({ styles: this.styles, isolates: this.isolates } = decorate(view));
    }
    update(update: ViewUpdate) {
      // The tree changes when a background parse finishes, as well as on edits.
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        ({ styles: this.styles, isolates: this.isolates } = decorate(update.view));
      }
    }
  },
  {
    provide: (plugin) => [
      EditorView.decorations.of((view) => view.plugin(plugin)?.styles ?? Decoration.none),
      EditorView.decorations.of((view) => view.plugin(plugin)?.isolates ?? Decoration.none),
      EditorView.bidiIsolatedRanges.of((view) => view.plugin(plugin)?.isolates ?? Decoration.none),
    ],
  },
);

/** Markdown styles and bidi rules for the visible part of the document. */
export const markdownDecorations = [EditorView.perLineTextDirection.of(true), markdownView];
