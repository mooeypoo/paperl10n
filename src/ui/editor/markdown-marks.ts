// SPDX-License-Identifier: GPL-3.0-or-later
// Live preview for inline markup and headings: away from the caret (live-preview.ts decides
// where), the marks that only say how text looks are hidden: `**` and `_` around emphasis, `~~`
// around struck text, the backticks around inline code, and an ATX heading's `#`s (with the space
// after them). The text keeps its look (markdown-decorations.ts styles it either way). Marks that
// carry content or structure stay: list markers, quotes, table pipes, code fences, Setext
// underlines, and anything in code or frontmatter.
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export interface MarkedElement {
  /** The element: the caret anywhere in it (edges included) shows its marks. */
  readonly from: number;
  readonly to: number;
  /** The ranges hidden while it's away from the caret, in order. */
  readonly hidden: readonly { readonly from: number; readonly to: number }[];
}

const inlineMarks: Readonly<Record<string, string>> = {
  Emphasis: 'EmphasisMark',
  StrongEmphasis: 'EmphasisMark',
  Strikethrough: 'StrikethroughMark',
  InlineCode: 'CodeMark',
};

/** The elements between `from` and `to` (touching them included) with marks to hide. */
export function markedElements(state: EditorState, from: number, to: number): MarkedElement[] {
  const { doc } = state;
  const elements: MarkedElement[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      const markName = inlineMarks[node.name];
      if (markName !== undefined) {
        const marks = node.node.getChildren(markName);
        const [open] = marks;
        const close = marks.at(-1);
        // An opening and a closing mark, with text between them.
        if (open === undefined || close === undefined || close.from <= open.to) return;
        elements.push({
          from: node.from,
          to: node.to,
          hidden: [
            { from: open.from, to: open.to },
            { from: close.from, to: close.to },
          ],
        });
        return;
      }
      if (!/^ATXHeading\d$/.test(node.name)) return;
      const hidden: { from: number; to: number }[] = [];
      let textFrom = node.from;
      let textTo = node.to;
      for (const mark of node.node.getChildren('HeaderMark')) {
        if (mark.from === node.from) {
          // The opening `#`s and the space after them.
          const end =
            mark.to + (/^[ \t]+/.exec(doc.sliceString(mark.to, node.to))?.[0].length ?? 0);
          hidden.push({ from: mark.from, to: end });
          textFrom = end;
        } else {
          // Closing `#`s and the space before them.
          const start =
            mark.from - (/[ \t]+$/.exec(doc.sliceString(node.from, mark.from))?.[0].length ?? 0);
          hidden.push({ from: Math.max(start, textFrom), to: mark.to });
          textTo = Math.max(start, textFrom);
        }
      }
      // A heading with no text keeps its marks: hiding them would leave an empty line.
      if (hidden.length > 0 && textTo > textFrom) {
        elements.push({ from: node.from, to: node.to, hidden });
      }
    },
  });
  return elements;
}
