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

/** What the person does to scroll an editor (or to move in it, which may scroll it). */
const steering = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Scrolls `a` and `b` together until the returned function is called. The one the person last
 * scrolled or used leads (`a` until then), and the other follows it. Only the leader's scrolling
 * is followed: an editor also scrolls by itself (following, or keeping its place as it measures
 * lines it had only estimated), and following that back would pull the leader away.
 */
export function scrollSync(a: EditorView, b: EditorView): () => void {
  let leader = a;

  const follow = (from: EditorView, to: EditorView) => {
    if (!sideBySide(from, to)) return;
    // The line read across: the lower of the two panes' tops, visible in both.
    const line = Math.max(
      from.scrollDOM.getBoundingClientRect().top,
      to.scrollDOM.getBoundingClientRect().top,
    );
    const height = matchingHeight(matchesBetween(from, to), line + from.scrollDOM.scrollTop);
    to.scrollDOM.scrollTop = height - line;
  };
  const followLeader = () => {
    follow(leader, leader === a ? b : a);
  };
  const leadA = () => {
    leader = a;
  };
  const leadB = () => {
    leader = b;
  };
  const scrolledA = () => {
    if (leader === a) followLeader();
  };
  const scrolledB = () => {
    if (leader === b) followLeader();
  };
  for (const name of steering) {
    a.scrollDOM.addEventListener(name, leadA, { passive: true });
    b.scrollDOM.addEventListener(name, leadB, { passive: true });
  }
  a.scrollDOM.addEventListener('scroll', scrolledA, { passive: true });
  b.scrollDOM.addEventListener('scroll', scrolledB, { passive: true });
  // Text that grows or shrinks (typing, wrapping, lines measured, the section view's spacers)
  // moves what's matched.
  const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(followLeader);
  resized?.observe(a.contentDOM);
  resized?.observe(b.contentDOM);
  followLeader();
  return () => {
    for (const name of steering) {
      a.scrollDOM.removeEventListener(name, leadA);
      b.scrollDOM.removeEventListener(name, leadB);
    }
    a.scrollDOM.removeEventListener('scroll', scrolledA);
    b.scrollDOM.removeEventListener('scroll', scrolledB);
    resized?.disconnect();
  };
}
