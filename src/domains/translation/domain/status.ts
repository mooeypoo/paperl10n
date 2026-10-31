// SPDX-License-Identifier: GPL-3.0-or-later
// Status: whether a translation is up to date with its source (PRD §6). A page's record keeps
// every source section as it was when the translation was last marked up to date, by fingerprint
// (docs/plan/M3-sections.md, questions 1 and 2). Status compares the source with its record, so it
// needs the source and the record only: never the translation's text.
import type { SectionKind } from './sections.ts';
import { alignSequences } from './sequence.ts';

/** A source section, as status sees it: its kind and its blocks' fingerprints, heading first. */
export interface SectionFingerprints {
  readonly kind: SectionKind;
  readonly blocks: readonly string[];
}

/** A source section in a page's record. */
export interface RecordedSection {
  readonly kind: SectionKind;
  /** A heading section's heading fingerprint, which identifies it; `null` for other kinds. */
  readonly heading: string | null;
  /**
   * Its blocks' fingerprints when it was last marked up to date; `null`: never marked. Empty for
   * a section added to the source after the page was recorded and not marked since.
   */
  readonly marked: readonly string[] | null;
}

/** A page's record: every source section as of the last mark, in order. */
export type PageRecord = readonly RecordedSection[];

export type SectionStatus =
  /** Never marked up to date. */
  | 'draft'
  /** Marked, and its source blocks are unchanged since. */
  | 'translated'
  /** Marked, and the source changed since: a block in it, or it's new, or a section after it was removed. */
  | 'outdated';

/** PRD §6: `missing` is a page without a translation file. */
export type PageStatus = 'missing' | SectionStatus;

const headingOf = (section: SectionFingerprints): string | null =>
  section.kind === 'heading' ? (section.blocks[0] ?? null) : null;

/** A section's identity across versions: its kind, and a heading section's heading. */
const keyOf = (section: { readonly kind: SectionKind; readonly heading: string | null }) =>
  `${section.kind}:${section.heading ?? ''}`;

/** A source section and what its page's record says about it. */
export interface SectionMatch {
  /** Its recorded version; `null`: new since the page was recorded. */
  readonly recorded: RecordedSection | null;
  /** The first section only: recorded sections removed from the source since, which came first. */
  readonly removedBefore: readonly RecordedSection[];
  /** Recorded sections removed from the source since, which followed this one. */
  readonly removedAfter: readonly RecordedSection[];
}

/**
 * Finds each source section in a page's record. Sections match by identity (kind and heading)
 * in order; between those, a changed heading is matched by place (the first unmatched section of
 * the same kind). What's left is new (no record) or removed (kept with the section before it,
 * or before the first section when it was first; `removedFirst` when the source has no sections
 * now).
 */
export function matchSections(
  current: readonly SectionFingerprints[],
  record: PageRecord,
): {
  readonly matches: readonly SectionMatch[];
  readonly removedFirst: readonly RecordedSection[];
} {
  const currentKeys = current.map((section) => keyOf({ ...section, heading: headingOf(section) }));
  const matched: (RecordedSection | null)[] = current.map(() => null);
  const removedAfter: RecordedSection[][] = current.map(() => []);
  const removedBefore: RecordedSection[] = [];
  const removedFirst: RecordedSection[] = [];
  /** A removed section stays with the source section before it (or the first, if none). */
  const remove = (recordIndex: number, before: number) => {
    const section = record[recordIndex];
    if (section === undefined) return;
    if (current.length === 0) removedFirst.push(section);
    else if (before < 0) removedBefore.push(section);
    else removedAfter[before]?.push(section);
  };

  // Between matches: pair added and removed sections of the same kind, in order.
  let last = -1;
  let added: number[] = [];
  let removed: number[] = [];
  const closeGap = () => {
    let next = 0;
    for (const index of added) {
      const found = removed.findIndex(
        (recordIndex, at) => at >= next && record[recordIndex]?.kind === current[index]?.kind,
      );
      if (found !== -1) {
        removed.slice(next, found).forEach((recordIndex) => {
          remove(recordIndex, index - 1);
        });
        matched[index] = record[removed[found] ?? -1] ?? null;
        next = found + 1;
      }
      last = index;
    }
    removed.slice(next).forEach((recordIndex) => {
      remove(recordIndex, last);
    });
    added = [];
    removed = [];
  };

  for (const step of alignSequences(record.map(keyOf), currentKeys)) {
    if (step.kind === 'same') {
      closeGap();
      matched[step.after] = record[step.before] ?? null;
      last = step.after;
    } else if (step.kind === 'added') {
      added.push(step.after);
    } else {
      removed.push(step.before);
    }
  }
  closeGap();
  return {
    matches: current.map((_section, index) => ({
      recorded: matched[index] ?? null,
      removedBefore: index === 0 ? removedBefore : [],
      removedAfter: removedAfter[index] ?? [],
    })),
    removedFirst,
  };
}

const sameBlocks = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((fingerprint, index) => fingerprint === b[index]);

const wasMarked = (section: RecordedSection) => section.marked !== null;

/** Each source section's status, given its page's record (`null`: the page was never recorded). */
export function sectionStatuses(
  current: readonly SectionFingerprints[],
  record: PageRecord | null,
): SectionStatus[] {
  if (record === null) return current.map(() => 'draft');
  const { matches } = matchSections(current, record);
  return current.map((section, index): SectionStatus => {
    const { recorded = null, removedBefore = [], removedAfter = [] } = matches[index] ?? {};
    if (recorded === null) return 'outdated';
    const removedMarked = [...removedBefore, ...removedAfter].some(wasMarked);
    if (recorded.marked === null) return removedMarked ? 'outdated' : 'draft';
    return !removedMarked && sameBlocks(recorded.marked, section.blocks)
      ? 'translated'
      : 'outdated';
  });
}

/**
 * A page's status: `missing` without a translation file, `draft` until it's recorded, `outdated`
 * when a section is (or a marked section was removed from the source), `translated` when every
 * section is, and `draft` otherwise (some sections never marked).
 */
export function pageStatus(
  current: readonly SectionFingerprints[],
  record: PageRecord | null,
  translationExists: boolean,
): PageStatus {
  if (!translationExists) return 'missing';
  if (record === null) return 'draft';
  const statuses = sectionStatuses(current, record);
  if (
    statuses.includes('outdated') ||
    matchSections(current, record).removedFirst.some(wasMarked)
  ) {
    return 'outdated';
  }
  return statuses.every((status) => status === 'translated') ? 'translated' : 'draft';
}

const markedNow = (section: SectionFingerprints): RecordedSection => ({
  kind: section.kind,
  heading: headingOf(section),
  marked: section.blocks,
});

/**
 * The page's record after marking sections up to date: `all`, or the source sections at these
 * indices (in source order). A marked section is recorded as the source has it now, and the
 * removed sections kept with it are dropped. The others keep what they had (an outdated section
 * stays outdated, under its current heading); on a page's first record, they're never marked.
 */
export function markSections(
  current: readonly SectionFingerprints[],
  record: PageRecord | null,
  which: 'all' | ReadonlySet<number>,
): PageRecord {
  if (which === 'all') return current.map(markedNow);
  const { matches, removedFirst } = matchSections(current, record ?? []);
  return [
    ...removedFirst.filter(wasMarked),
    ...current.flatMap((section, index): RecordedSection[] => {
      if (which.has(index)) return [markedNow(section)];
      const { recorded = null, removedBefore = [], removedAfter = [] } = matches[index] ?? {};
      const kept: RecordedSection = {
        kind: section.kind,
        heading: headingOf(section),
        marked: recorded === null ? (record === null ? null : []) : recorded.marked,
      };
      return [...removedBefore.filter(wasMarked), kept, ...removedAfter.filter(wasMarked)];
    }),
  ];
}
