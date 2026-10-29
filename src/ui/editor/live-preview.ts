// SPDX-License-Identifier: GPL-3.0-or-later
// Live preview: away from the caret, Markdown that only says how text looks is hidden, so the text
// reads as prose (links as their text and a chip: markdown-links.ts; emphasis, inline code, and
// heading marks: markdown-marks.ts). Where the caret or a selection touches an element, its
// Markdown shows for editing. Only the display changes: the document is still the file's text.
import { syntaxTree } from '@codemirror/language';
import type { Range, SelectionRange } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { linkDecorations, linkLabel, linkPreviews } from './markdown-links.ts';
import { markedElements } from './markdown-marks.ts';

/** An element shows its Markdown when a caret or a selection touches it (its edges included). */
export function revealed(
  element: { readonly from: number; readonly to: number },
  ranges: readonly SelectionRange[],
): boolean {
  return ranges.some((range) => range.from <= element.to && range.to >= element.from);
}

const hidden = Decoration.replace({});

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const { from, to } = view.viewport;
  // An editor without focus shows everything as a preview: its caret isn't anywhere to be seen.
  const ranges = view.hasFocus ? state.selection.ranges : [];
  const label = state.facet(linkLabel);
  const decorations: Range<Decoration>[] = [];
  for (const link of linkPreviews(state, from, to)) {
    if (!revealed(link, ranges)) decorations.push(...linkDecorations(link, label(link.url)));
  }
  for (const element of markedElements(state, from, to)) {
    if (revealed(element, ranges)) continue;
    for (const range of element.hidden) decorations.push(hidden.range(range.from, range.to));
  }
  return Decoration.set(decorations, true);
}

/** The live preview, rebuilt as the caret moves (unlike the styles, which don't depend on it). */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.startState.facet(linkLabel) !== update.state.facet(linkLabel) ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorate(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
