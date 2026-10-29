// SPDX-License-Identifier: GPL-3.0-or-later
// Live preview for inline links: away from the caret, `[text](url "title")` shows as its text,
// underlined, followed by a small link chip. The URL, the brackets, and the title are hidden, so a
// right-to-left sentence reads as prose. When the caret or a selection touches the link, its
// Markdown comes back for editing. Only the display changes: the document is still the file's text.
// Reference links (`[text][ref]`), autolinks, and images stay as written. Clicking a chip edits
// the link through a form (link-editing.ts); in read-only text, it reveals the link instead.
import { syntaxTree } from '@codemirror/language';
import { Facet, type EditorState, type Range, type SelectionRange } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { icons } from '../components/icons.ts';

export interface LinkPreview {
  /** The whole link, `[` to `)`. */
  readonly from: number;
  readonly to: number;
  /** The link text, between the brackets. */
  readonly textFrom: number;
  readonly textTo: number;
  /** The link's destination as written, `<` and `>` included if it has them. */
  readonly urlFrom: number;
  readonly urlTo: number;
  /** The destination itself (without the `<` and `>`). */
  readonly url: string;
}

/** The inline links between `from` and `to` (touching them included) with a URL. */
export function linkPreviews(state: EditorState, from: number, to: number): LinkPreview[] {
  const links: LinkPreview[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== 'Link') return;
      const marks = node.node.getChildren('LinkMark');
      const url = node.node.getChild('URL');
      const [open, close, paren] = marks;
      const last = marks.at(-1);
      // `[text](url)` has four marks: `[`, `]`, `(`, `)`. A reference link has no `(`.
      if (
        url === null ||
        open === undefined ||
        close === undefined ||
        paren === undefined ||
        last === undefined ||
        state.doc.sliceString(paren.from, paren.to) !== '(' ||
        state.doc.sliceString(last.from, last.to) !== ')' ||
        close.from <= open.to
      ) {
        return;
      }
      links.push({
        from: node.from,
        to: node.to,
        textFrom: open.to,
        textTo: close.from,
        urlFrom: url.from,
        urlTo: url.to,
        url: state.doc.sliceString(url.from, url.to).replace(/^<(.*)>$/s, '$1'),
      });
    },
  });
  return links;
}

/** A link shows its Markdown when a caret or a selection touches it (its edges included). */
export function linkRevealed(link: LinkPreview, ranges: readonly SelectionRange[]): boolean {
  return ranges.some((range) => range.from <= link.to && range.to >= link.from);
}

/** The accessible name of a link chip, from its URL (in the interface's language). */
export const linkLabel = Facet.define<(url: string) => string, (url: string) => string>({
  combine: (values) => values[0] ?? ((url) => url),
});

const svgNamespace = 'http://www.w3.org/2000/svg';

class LinkChip extends WidgetType {
  readonly url: string;
  readonly label: string;

  constructor(url: string, label: string) {
    super();
    this.url = url;
    this.label = label;
  }

  override eq(other: LinkChip): boolean {
    return other.url === this.url && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'cm-md-link-chip';
    chip.title = this.url;
    chip.setAttribute('role', 'img');
    chip.setAttribute('aria-label', this.label);
    const svg = document.createElementNS(svgNamespace, 'svg');
    for (const [name, value] of Object.entries({
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    })) {
      svg.setAttribute(name, value);
    }
    for (const data of icons.link.paths) {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('d', data);
      svg.append(path);
    }
    chip.append(svg);
    return chip;
  }

  // Let the editor handle clicks: link-editing.ts, or (read-only) the caret goes to the link.
  override ignoreEvent(): boolean {
    return false;
  }
}

const hidden = Decoration.replace({});
const linkText = Decoration.mark({ class: 'cm-md-link-text' });

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  // An editor without focus shows every link as a preview: its caret isn't anywhere to be seen.
  const ranges = view.hasFocus ? state.selection.ranges : [];
  const label = state.facet(linkLabel);
  const decorations: Range<Decoration>[] = [];
  for (const link of linkPreviews(state, view.viewport.from, view.viewport.to)) {
    if (link.textTo <= link.textFrom || linkRevealed(link, ranges)) continue;
    decorations.push(
      hidden.range(link.from, link.textFrom),
      linkText.range(link.textFrom, link.textTo),
      Decoration.replace({ widget: new LinkChip(link.url, label(link.url)) }).range(
        link.textTo,
        link.to,
      ),
    );
  }
  return Decoration.set(decorations, true);
}

/** Inline links shown as their text and a chip, except where the caret is. */
export const linkPreview = ViewPlugin.fromClass(
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
