// SPDX-License-Identifier: GPL-3.0-or-later
// Scrolling the two panes together (docs/plan/M3-sections.md, question 8): scrolling one editor
// scrolls the other so a paired section's start lines up with its pair, and between them by
// relative position. In the section view the spacers already line the pairs up, so that keeps
// the panes locked; in the full-page view it's loose, a way to keep one's place.
//
// Heights are "at rest": where a point would be on screen with its editor scrolled to the top, so
// they don't change as the editors scroll.
import type { EditorView } from '@codemirror/view';
import { restingTop, sectionAnchors, sideBySide, textTop } from './section-alignment.ts';

/** A height in one editor and the height it matches in the other. */
type Match = readonly [number, number];

/**
 * The matching heights, in order: the documents' tops, each pair's start (where both sides have
 * one), and the documents' ends. A pair that would go back up on either side, or reach past the
 * ends, is left out, so the list only goes down on both.
 */
export function matchingHeights(
  tops: Match,
  pairs: readonly (Match | null)[],
  ends: Match,
): Match[] {
  const matches: Match[] = [tops];
  let last = tops;
  for (const match of pairs) {
    if (match === null || match[0] <= last[0] || match[1] < last[1]) continue;
    if (match[0] >= ends[0] || match[1] > ends[1]) continue;
    matches.push(match);
    last = match;
  }
  if (ends[0] > last[0] && ends[1] >= last[1]) matches.push(ends);
  return matches;
}

/** The height in the other editor that matches `height` in this one, between the nearest matches. */
export function matchingHeight(matches: readonly Match[], height: number): number {
  const after = matches.findIndex(([here]) => here > height);
  const before = matches[after === -1 ? matches.length - 1 : after - 1];
  const next = after === -1 ? undefined : matches[after];
  if (before === undefined) return next === undefined ? height : next[1] - (next[0] - height);
  if (next === undefined) return before[1] + (height - before[0]);
  return before[1] + ((height - before[0]) / (next[0] - before[0])) * (next[1] - before[1]);
}

/** The matching heights from `from` to `to`, at rest. */
function matchesBetween(from: EditorView, to: EditorView): Match[] {
  const fromTop = restingTop(from);
  const toTop = restingTop(to);
  const fromAnchors = from.state.field(sectionAnchors, false) ?? [];
  const toAnchors = to.state.field(sectionAnchors, false) ?? [];
  const pairs = fromAnchors.map((at, index): Match | null => {
    const other = toAnchors[index] ?? null;
    if (at === null || other === null) return null;
    return [
      fromTop + textTop(from, from.state.doc.lineAt(at).from),
      toTop + textTop(to, to.state.doc.lineAt(other).from),
    ];
  });
  return matchingHeights([fromTop, toTop], pairs, [
    fromTop + from.contentHeight,
    toTop + to.contentHeight,
  ]);
}

/**
 * Scrolls `a` and `b` together until the returned function is called. `a` keeps its place when
 * they start (and whenever their text changes size, until `b` is scrolled).
 */
export function scrollSync(a: EditorView, b: EditorView): () => void {
  /** The editor scrolled last, which the other follows. */
  let leader = a;
  /** Where an editor was scrolled to by following, so its own scroll event isn't followed back. */
  const followed = new Map<EditorView, number>();

  const follow = (from: EditorView, to: EditorView) => {
    if (!sideBySide(from, to)) return;
    // The line read across: the lower of the two panes' tops, visible in both.
    const line = Math.max(
      from.scrollDOM.getBoundingClientRect().top,
      to.scrollDOM.getBoundingClientRect().top,
    );
    const height = matchingHeight(matchesBetween(from, to), line + from.scrollDOM.scrollTop);
    const before = to.scrollDOM.scrollTop;
    to.scrollDOM.scrollTop = height - line;
    // (The browser keeps it within the pane's range, so it's read back.)
    if (to.scrollDOM.scrollTop !== before) followed.set(to, to.scrollDOM.scrollTop);
  };
  const scrolled = (view: EditorView, other: EditorView) => () => {
    const expected = followed.get(view);
    followed.delete(view);
    if (expected !== undefined && Math.abs(view.scrollDOM.scrollTop - expected) < 1) return;
    leader = view;
    follow(view, other);
  };
  const onA = scrolled(a, b);
  const onB = scrolled(b, a);
  a.scrollDOM.addEventListener('scroll', onA, { passive: true });
  b.scrollDOM.addEventListener('scroll', onB, { passive: true });
  // Text that grows or shrinks (typing, wrapping, the section view's spacers) moves what's matched.
  const resized =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          follow(leader, leader === a ? b : a);
        });
  resized?.observe(a.contentDOM);
  resized?.observe(b.contentDOM);
  follow(a, b);
  return () => {
    a.scrollDOM.removeEventListener('scroll', onA);
    b.scrollDOM.removeEventListener('scroll', onB);
    resized?.disconnect();
  };
}
