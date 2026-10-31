// SPDX-License-Identifier: GPL-3.0-or-later
// What changed in the source since the translation was marked up to date (docs/plan/M3-sections.md,
// S4), shown in the source pane: each changed or new block's lines are tinted and marked at their
// inline start, and a marker sits where marked text was removed. Shown in both views.
import { StateEffect, StateField, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

/** Positions are into the editor's document. */
export interface SourceChangeMarks {
  readonly blocks: readonly {
    readonly kind: 'changed' | 'added';
    readonly from: number;
    readonly to: number;
  }[];
  /** Before the block starting at `at`, or after the one ending there. */
  readonly removals: readonly { readonly at: number; readonly side: 'before' | 'after' }[];
  /** The removal marker's text, in the interface's language and direction. */
  readonly removedLabel: string;
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
}

/** Sets the changes shown (`null`: none). */
export const setSourceChanges = StateEffect.define<SourceChangeMarks | null>();

class RemovalWidget extends WidgetType {
  readonly label: string;
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
  constructor({ removedLabel, lang, dir }: SourceChangeMarks) {
    super();
    this.label = removedLabel;
    this.lang = lang;
    this.dir = dir;
  }
  override eq(other: RemovalWidget): boolean {
    return other.label === this.label && other.lang === this.lang && other.dir === this.dir;
  }
  override toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'cm-source-removed';
    element.lang = this.lang;
    element.dir = this.dir;
    element.contentEditable = 'false';
    element.textContent = this.label;
    return element;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const lineMarks = {
  changed: Decoration.line({ class: 'cm-source-change', attributes: { 'data-change': 'changed' } }),
  added: Decoration.line({ class: 'cm-source-change', attributes: { 'data-change': 'added' } }),
};

function decorationsFor(marks: SourceChangeMarks, doc: Text): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const inDoc = (position: number) => Math.min(Math.max(position, 0), doc.length);
  for (const { kind, from, to } of marks.blocks) {
    const first = doc.lineAt(inDoc(from)).number;
    const last = doc.lineAt(inDoc(Math.max(from, to))).number;
    for (let number = first; number <= last; number++) {
      ranges.push(lineMarks[kind].range(doc.line(number).from));
    }
  }
  const widget = new RemovalWidget(marks);
  for (const { at, side } of marks.removals) {
    const line = doc.lineAt(inDoc(at));
    ranges.push(
      side === 'before'
        ? Decoration.widget({ widget, block: true, side: -1 }).range(line.from)
        : Decoration.widget({ widget, block: true, side: 1 }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
}

const sourceChangeDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setSourceChanges)) {
        next =
          effect.value === null
            ? Decoration.none
            : decorationsFor(effect.value, transaction.state.doc);
      }
    }
    return next;
  },
  // Block widgets must come from state, not from a view plugin.
  provide: (field) => EditorView.decorations.from(field),
});

export const sourceChanges = [sourceChangeDecorations];
