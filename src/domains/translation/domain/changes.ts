// SPDX-License-Identifier: GPL-3.0-or-later
// Source changes: which of a source's blocks changed since their section was marked up to date,
// and where marked text was removed (docs/plan/M3-sections.md, question 5). Read from the same
// record as status, so it shows which blocks changed, never their old wording.
import { alignSequences } from './sequence.ts';
import {
  matchSections,
  type PageRecord,
  type RecordedSection,
  type SectionFingerprints,
} from './status.ts';

/** What changed in one source section since it was marked, by index into its blocks. */
export interface SectionChanges {
  /** Blocks that replaced marked ones. */
  readonly changed: readonly number[];
  /** Blocks new since the section was marked (or all of a section new since the record). */
  readonly added: readonly number[];
  /** Where marked blocks or sections were removed: before the block at each index (the block count: at the end). */
  readonly removed: readonly number[];
}

export interface SourceChanges {
  readonly sections: readonly SectionChanges[];
  /** Marked sections were removed and the source has no sections left. */
  readonly removedFirst: boolean;
}

const none: SectionChanges = { changed: [], added: [], removed: [] };

const wasMarked = (section: RecordedSection) => section.marked !== null;

/**
 * How `blocks` differ from `marked`: aligned by fingerprint; in each gap, as many new blocks as
 * were removed are `changed`, the rest `added`, and removed blocks left over are a removal.
 */
function blockChanges(marked: readonly string[], blocks: readonly string[]): SectionChanges {
  const changed: number[] = [];
  const added: number[] = [];
  const removed: number[] = [];
  let gapAdded: number[] = [];
  let gapRemoved = 0;
  const closeGap = (at: number) => {
    gapAdded.forEach((block, index) => (index < gapRemoved ? changed : added).push(block));
    if (gapRemoved > gapAdded.length) removed.push(at);
    gapAdded = [];
    gapRemoved = 0;
  };
  for (const step of alignSequences(marked, blocks)) {
    if (step.kind === 'same') closeGap(step.after);
    else if (step.kind === 'added') gapAdded.push(step.after);
    else gapRemoved++;
  }
  closeGap(blocks.length);
  return { changed, added, removed };
}

/**
 * What changed in each source section since it was marked up to date, given its page's record
 * (`null`: never recorded, so nothing to compare). A section never marked shows no block changes;
 * one new since the record is all new. Marked sections removed show where they were.
 */
export function sourceChanges(
  current: readonly SectionFingerprints[],
  record: PageRecord | null,
): SourceChanges {
  if (record === null) return { sections: current.map(() => none), removedFirst: false };
  const { matches, removedFirst } = matchSections(current, record);
  return {
    sections: current.map((section, index): SectionChanges => {
      const { recorded = null, removedBefore = [], removedAfter = [] } = matches[index] ?? {};
      // A section recorded with no blocks (new since the record) diffs as all new, too.
      const own =
        recorded === null
          ? { ...none, added: section.blocks.map((_block, block) => block) }
          : recorded.marked === null
            ? none
            : blockChanges(recorded.marked, section.blocks);
      const removed = new Set(own.removed);
      if (removedBefore.some(wasMarked)) removed.add(0);
      if (removedAfter.some(wasMarked)) removed.add(section.blocks.length);
      return { ...own, removed: [...removed].sort((a, b) => a - b) };
    }),
    removedFirst: removedFirst.some(wasMarked),
  };
}
