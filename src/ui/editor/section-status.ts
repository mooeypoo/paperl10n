// SPDX-License-Identifier: GPL-3.0-or-later
// Each section's status in the section view (docs/plan/M3-sections.md, S3d): a bar above the
// section's first line, with "Mark up to date" while it isn't. It sits where the section's anchor
// is (section-alignment.ts), so it follows edits, and below the alignment spacer, so the bar and
// its heading stay together while the headings line up.
import { RangeSet, StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { sectionAnchors, sectionsShown } from './section-alignment.ts';

/** One section's bar, with its text in the interface's language. */
export interface SectionBar {
  readonly status: 'draft' | 'translated' | 'outdated';
  /** The status, as shown. */
  readonly statusLabel: string;
  /** The button's text and its accessible name; `null`: no button (up to date). */
  readonly mark: { readonly label: string; readonly name: string } | null;
  /** A mark is on its way: the button waits. */
  readonly busy: boolean;
}

export interface SectionBars {
  /** By pair index, like the anchors; `null`: no bar for that pair. */
  readonly bars: readonly (SectionBar | null)[];
  /** Marks the section of this pair index up to date. */
  readonly onMark: (pairIndex: number) => void;
  /** The interface's language and direction (the bar is interface text, not the document's). */
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
}

/** Sets the bars (`null`: none). */
export const setSectionBars = StateEffect.define<SectionBars | null>();

const sectionBars = StateField.define<SectionBars | null>({
  create: () => null,
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) if (effect.is(setSectionBars)) next = effect.value;
    return next;
  },
});

class SectionBarWidget extends WidgetType {
  readonly bar: SectionBar;
  readonly index: number;
  readonly bars: SectionBars;
  constructor(bar: SectionBar, index: number, bars: SectionBars) {
    super();
    this.bar = bar;
    this.index = index;
    this.bars = bars;
  }
  override eq(other: SectionBarWidget): boolean {
    const a = this.bar;
    const b = other.bar;
    return (
      other.index === this.index &&
      other.bars.onMark === this.bars.onMark &&
      other.bars.lang === this.bars.lang &&
      a.status === b.status &&
      a.statusLabel === b.statusLabel &&
      a.busy === b.busy &&
      a.mark?.label === b.mark?.label &&
      a.mark?.name === b.mark?.name
    );
  }
  override toDOM(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'cm-section-bar';
    element.dataset.status = this.bar.status;
    element.lang = this.bars.lang;
    element.dir = this.bars.dir;
    element.contentEditable = 'false';
    const status = document.createElement('span');
    status.className = 'cm-section-bar-status';
    status.textContent = this.bar.statusLabel;
    element.append(status);
    const { mark } = this.bar;
    if (mark !== null) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cm-section-bar-mark';
      button.textContent = mark.label;
      button.setAttribute('aria-label', mark.name);
      button.disabled = this.bar.busy;
      const { index, bars } = this;
      button.addEventListener('click', () => {
        bars.onMark(index);
      });
      element.append(button);
    }
    return element;
  }
  // The bar handles its own events (the button): the editor leaves them alone.
  override ignoreEvent(): boolean {
    return true;
  }
}

/** The bars, in the section view, above each section's first line. */
const barDecorations = EditorView.decorations.compute(
  [sectionBars, sectionAnchors, sectionsShown],
  (state) => {
    const bars = state.field(sectionBars);
    const anchors = state.field(sectionAnchors);
    if (bars === null || anchors === null || !state.field(sectionsShown)) return Decoration.none;
    const widgets: Range<Decoration>[] = [];
    const seen = new Set<number>();
    anchors.forEach((position, index) => {
      const bar = bars.bars[index] ?? null;
      if (position === null || bar === null) return;
      const line = state.doc.lineAt(position).from;
      if (seen.has(line)) return;
      seen.add(line);
      widgets.push(
        Decoration.widget({
          widget: new SectionBarWidget(bar, index, bars),
          block: true,
          side: -1,
        }).range(line),
      );
    });
    return RangeSet.of(widgets, true);
  },
);

export const sectionStatus = [sectionBars, barDecorations];
