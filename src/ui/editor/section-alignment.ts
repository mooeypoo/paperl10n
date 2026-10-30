// SPDX-License-Identifier: GPL-3.0-or-later
// The section view (docs/plan/M3-sections.md): the source and translation editors stay whole
// documents, and each pair of sections starts side by side. Main pairs the sections when the page
// opens; each editor gets where its sections start (anchors, which follow edits), marks those
// lines, and takes spacers above them, so the shorter side waits for the longer one.
//
// The anchors aren't re-paired as the text changes: the view stays as it opened, and
// `headingCount` lets the UI say when the sections no longer match.
import { ensureSyntaxTree } from '@codemirror/language';
import {
  MapMode,
  RangeSet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  BlockType,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

/** Where each section starts, in pair order; `null` where this side lacks it, or it was deleted. */
type Anchors = readonly (number | null)[];

/** Sets the anchors, when the page opens (`null`: its sections aren't paired). */
export const setSectionAnchors = StateEffect.define<Anchors | null>();
/** Shows or hides the section view (the anchors keep following edits either way). */
export const showSections = StateEffect.define<boolean>();

/** Whether the section view is shown. */
export const sectionsShown = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) if (effect.is(showSections)) next = effect.value;
    return next;
  },
});

/** Where each section starts now, in pair order (`null`: not paired, or gone). */
export const sectionAnchors = StateField.define<Anchors | null>({
  create: () => null,
  update(value, transaction) {
    let next = value;
    if (next !== null && transaction.docChanged) {
      // An anchor follows text typed at its start (assoc 1), except the document's start, where
      // new text belongs to the first section. It's gone when the text around it is deleted, or
      // when its line is left empty (the section's text was removed).
      const { doc } = transaction.state;
      next = next.map((position) => {
        if (position === 0) return 0;
        const mapped =
          position === null ? null : transaction.changes.mapPos(position, 1, MapMode.TrackDel);
        return mapped === null || doc.lineAt(mapped).text.trim() === '' ? null : mapped;
      });
    }
    for (const effect of transaction.effects) {
      if (effect.is(setSectionAnchors)) next = effect.value;
    }
    return next;
  },
});

/** Each section's first line, except the document's first: a rule above it marks the boundary. */
const sectionStarts = EditorView.decorations.compute([sectionAnchors, sectionsShown], (state) => {
  const marks: Range<Decoration>[] = [];
  if (!state.field(sectionsShown)) return Decoration.none;
  const seen = new Set<number>();
  for (const position of state.field(sectionAnchors) ?? []) {
    if (position === null) continue;
    const line = state.doc.lineAt(position);
    if (line.number === 1 || seen.has(line.from)) continue;
    seen.add(line.from);
    marks.push(sectionStart.range(line.from));
  }
  return RangeSet.of(marks, true);
});
const sectionStart = Decoration.line({ class: 'cm-section-start' });

interface Spacer {
  /** The start of the line it sits above, or the document's end for one after the last line. */
  readonly position: number;
  /** In CSS pixels. */
  readonly height: number;
  /** After the last line, so both documents end level (and can scroll as far). */
  readonly end?: true;
}

class SpacerWidget extends WidgetType {
  readonly height: number;
  constructor(height: number) {
    super();
    this.height = height;
  }
  override eq(other: SpacerWidget): boolean {
    return other.height === this.height;
  }
  override toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'cm-section-spacer';
    element.setAttribute('aria-hidden', 'true');
    // Set through the CSSOM, which the CSP allows (unlike a style attribute in markup).
    element.style.height = `${String(this.height)}px`;
    return element;
  }
  override get estimatedHeight(): number {
    return this.height;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const setSpacers = StateEffect.define<readonly Spacer[]>();

const spacerDecorations = (list: readonly Spacer[]): DecorationSet =>
  Decoration.set(
    list.map(({ position, height, end }) =>
      Decoration.widget({
        widget: new SpacerWidget(height),
        block: true,
        side: end === true ? 1 : -2,
      }).range(position),
    ),
    true,
  );

const spacers = StateField.define<{
  readonly list: readonly Spacer[];
  readonly set: DecorationSet;
}>({
  create: () => ({ list: [], set: Decoration.none }),
  update(value, transaction) {
    let list = value.list;
    if (transaction.docChanged && list.length > 0) {
      // Each stays above the start of its line, wherever edits move that line.
      const { doc } = transaction.state;
      list = list.map((spacer) => ({
        ...spacer,
        position:
          spacer.end === true
            ? doc.length
            : doc.lineAt(transaction.changes.mapPos(spacer.position, 1)).from,
      }));
    }
    for (const effect of transaction.effects) {
      if (effect.is(setSpacers)) list = effect.value;
    }
    return list === value.list ? value : { list, set: spacerDecorations(list) };
  },
  // Block widgets must come from state, not from a view plugin.
  provide: (field) => EditorView.decorations.from(field, (value) => value.set),
});

/** The editors aligned with each other, by view. */
const alignments = new WeakMap<EditorView, Alignment>();

/** Every editor has the section view's state; it does nothing until anchors and a partner come. */
export const sectionView: Extension = [
  sectionAnchors,
  sectionsShown,
  spacers,
  sectionStarts,
  EditorView.updateListener.of((update) => {
    if (
      update.docChanged ||
      update.heightChanged ||
      update.geometryChanged ||
      update.viewportChanged ||
      update.transactions.some((transaction) =>
        transaction.effects.some(
          (effect) => effect.is(setSectionAnchors) || effect.is(showSections),
        ),
      )
    ) {
      alignments.get(update.view)?.schedule();
    }
  }),
];

/** Where the document's top sits on screen with the editor scrolled to the top. */
export const restingTop = (view: EditorView): number => view.documentTop + view.scrollDOM.scrollTop;

/** The height of the spacers above a line's text (not the one after the last line). */
const spacersAbove = (view: EditorView, line: number) =>
  (view.state.field(spacers, false)?.list ?? [])
    .filter((spacer) => spacer.end !== true && spacer.position <= line)
    .reduce((sum, spacer) => sum + spacer.height, 0);

/** The bottom of a line's text, above any block widgets after it (the end spacer). */
function textBottom(view: EditorView, position: number): number {
  const block = view.lineBlockAt(position);
  if (!Array.isArray(block.type)) return block.bottom;
  const parts: readonly { readonly type: unknown; readonly bottom: number }[] = block.type;
  return parts.findLast((part) => part.type === BlockType.Text)?.bottom ?? block.bottom;
}

/** The top of a line's text, below any block widgets above it (our spacers). */
export function textTop(view: EditorView, position: number): number {
  const block = view.lineBlockAt(position);
  if (!Array.isArray(block.type)) return block.top;
  const parts: readonly { readonly type: unknown; readonly top: number }[] = block.type;
  return parts.find((part) => part.type === BlockType.Text)?.top ?? block.top;
}

/**
 * The spacers that line each pair up: walking the pairs in order, the side whose section starts
 * higher (as laid out without spacers, plus the spacers placed so far) gets the difference. With
 * `ends` (where each document's text ends, and its length), the side that ends higher gets one
 * after its last line too.
 */
export function spacersFor(
  tops: readonly (readonly [number, number] | null)[],
  positions: readonly (readonly [number, number] | null)[],
  ends?: {
    readonly bottoms: readonly [number, number];
    readonly lengths: readonly [number, number];
  },
): [Spacer[], Spacer[]] {
  const result: [Spacer[], Spacer[]] = [[], []];
  let shiftA = 0;
  let shiftB = 0;
  tops.forEach((pair, index) => {
    const at = positions[index];
    if (pair === null || at === null || at === undefined) return;
    const difference = Math.round(pair[1] + shiftB - (pair[0] + shiftA));
    if (difference > 0) {
      result[0].push({ position: at[0], height: difference });
      shiftA += difference;
    } else if (difference < 0) {
      result[1].push({ position: at[1], height: -difference });
      shiftB -= difference;
    }
  });
  if (ends !== undefined) {
    const difference = Math.round(ends.bottoms[1] + shiftB - (ends.bottoms[0] + shiftA));
    if (difference > 0)
      result[0].push({ position: ends.lengths[0], height: difference, end: true });
    if (difference < 0) {
      result[1].push({ position: ends.lengths[1], height: -difference, end: true });
    }
  }
  return result;
}

const sameSpacers = (a: readonly Spacer[], b: readonly Spacer[]) =>
  a.length === b.length &&
  a.every((spacer, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      spacer.position === other.position &&
      spacer.end === other.end &&
      Math.abs(spacer.height - other.height) <= 1
    );
  });

class Alignment {
  readonly a: EditorView;
  readonly b: EditorView;
  #destroyed = false;
  constructor(a: EditorView, b: EditorView) {
    this.a = a;
    this.b = b;
  }

  schedule(): void {
    if (this.#destroyed) return;
    this.a.requestMeasure({
      key: this,
      read: () => this.#measure(),
      // An editor can't be updated during its own measuring: apply right after it.
      write: (next) => {
        queueMicrotask(() => {
          if (!this.#destroyed) this.#apply(next);
        });
      },
    });
  }

  destroy(): void {
    this.#destroyed = true;
    alignments.delete(this.a);
    alignments.delete(this.b);
    this.#apply([[], []]);
  }

  #apply([forA, forB]: [Spacer[], Spacer[]]): void {
    for (const [view, wanted] of [
      [this.a, forA],
      [this.b, forB],
    ] as const) {
      const current = view.state.field(spacers, false)?.list;
      if (current !== undefined && !sameSpacers(current, wanted)) {
        view.dispatch({ effects: setSpacers.of(wanted) });
      }
    }
  }

  #measure(): [Spacer[], Spacer[]] {
    const { a, b } = this;
    const anchorsA = a.state.field(sectionAnchors, false) ?? null;
    const anchorsB = b.state.field(sectionAnchors, false) ?? null;
    if (anchorsA === null || anchorsB === null) return [[], []];
    if (
      a.state.field(sectionsShown, false) !== true ||
      b.state.field(sectionsShown, false) !== true
    )
      return [[], []];
    // Stacked panes (a narrow window) don't sit side by side: nothing to line up.
    if (!sideBySide(a, b)) return [[], []];

    // Where each line would be on screen with its editor scrolled to the top (each pane scrolls
    // on its own), without spacers.
    const natural = (view: EditorView, position: number) => {
      const line = view.state.doc.lineAt(position).from;
      const top = restingTop(view) + textTop(view, line) - spacersAbove(view, line);
      return { line, top };
    };
    const tops: ([number, number] | null)[] = [];
    const positions: ([number, number] | null)[] = [];
    const count = Math.min(anchorsA.length, anchorsB.length);
    for (let index = 0; index < count; index++) {
      const atA = anchorsA[index] ?? null;
      const atB = anchorsB[index] ?? null;
      if (atA === null || atB === null) {
        tops.push(null);
        positions.push(null);
        continue;
      }
      const sideA = natural(a, atA);
      const sideB = natural(b, atB);
      tops.push([sideA.top, sideB.top]);
      positions.push([sideA.line, sideB.line]);
    }
    const bottom = (view: EditorView) => {
      const { length } = view.state.doc;
      return restingTop(view) + textBottom(view, length) - spacersAbove(view, length);
    };
    return spacersFor(tops, positions, {
      bottoms: [bottom(a), bottom(b)],
      lengths: [a.state.doc.length, b.state.doc.length],
    });
  }
}

/** Whether two editors sit side by side (not stacked, as in a narrow window). */
export function sideBySide(a: EditorView, b: EditorView): boolean {
  const boxA = a.contentDOM.getBoundingClientRect();
  const boxB = b.contentDOM.getBoundingClientRect();
  return boxA.right <= boxB.left + 1 || boxB.right <= boxA.left + 1;
}

/** Lines the editor up with its partner again (something outside its document moved it). */
export function realign(view: EditorView): void {
  alignments.get(view)?.schedule();
}

/** Lines up two editors' sections, until the returned function is called. */
export function alignSections(a: EditorView, b: EditorView): () => void {
  alignments.get(a)?.destroy();
  alignments.get(b)?.destroy();
  const alignment = new Alignment(a, b);
  alignments.set(a, alignment);
  alignments.set(b, alignment);
  alignment.schedule();
  return () => {
    alignment.destroy();
  };
}

/**
 * How many top-level headings of `depth` the document has (as the page's sections are split), or
 * `null` if the document isn't parsed that far yet.
 */
export function headingCount(state: EditorState, depth: number): number | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 50);
  if (tree === null) return null;
  let count = 0;
  for (let node = tree.topNode.firstChild; node !== null; node = node.nextSibling) {
    if (
      node.name === `ATXHeading${String(depth)}` ||
      node.name === `SetextHeading${String(depth)}`
    ) {
      count++;
    }
  }
  return count;
}
