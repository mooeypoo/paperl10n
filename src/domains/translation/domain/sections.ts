// SPDX-License-Identifier: GPL-3.0-or-later
// Sections: the unit Paper Lion pairs between a source document and its translation (PRD §7.2).
// A document splits at its headings of one level; the translation splits at its source's level,
// and the two pair in order, or not at all: never by guessing (docs/plan/M3-sections.md, question
// 3). Pure, over a document's outline (its top-level blocks), so the same rules can run wherever
// the blocks are known.
import type { TextRange } from '#kernel/text-range';

/** A top-level block of a document, as much of it as sections need. */
export interface OutlineBlock {
  readonly range: TextRange;
  /** Headings only: 1–6. */
  readonly headingDepth?: number;
  /** The frontmatter block (at most one, first). */
  readonly frontmatter?: boolean;
}

export type SectionKind =
  /** The frontmatter, a row of its own. */
  | 'frontmatter'
  /** The text before the first heading at the split level (a lone title included). */
  | 'intro'
  /** A heading at the split level, and everything up to the next one. */
  | 'heading';

export interface Section {
  readonly kind: SectionKind;
  /** From its first block to the start of the next section; the last runs to the end. */
  readonly range: TextRange;
  /** Its blocks, in order: for a heading section, the heading first. */
  readonly blocks: readonly OutlineBlock[];
}

/**
 * The heading depth a document splits at: the shallowest one in it, except a lone title (that
 * depth appears once, as the first heading), which splits at the next depth that appears instead.
 * `null` for a document without headings.
 */
export function splitLevel(blocks: readonly OutlineBlock[]): number | null {
  const depths = blocks.flatMap((block) =>
    block.headingDepth === undefined ? [] : [block.headingDepth],
  );
  const [first] = depths;
  if (first === undefined) return null;
  const shallowest = Math.min(...depths);
  const isLoneTitle =
    first === shallowest && depths.filter((depth) => depth === shallowest).length === 1;
  const deeper = depths.filter((depth) => depth > shallowest);
  return isLoneTitle && deeper.length > 0 ? Math.min(...deeper) : shallowest;
}

/** A document's sections when split at `level` (`null`: no heading sections, all intro). */
export function sectionsAt(
  blocks: readonly OutlineBlock[],
  length: number,
  level: number | null,
): Section[] {
  const groups: { kind: SectionKind; blocks: OutlineBlock[] }[] = [];
  for (const block of blocks) {
    const current = groups.at(-1);
    if (block.frontmatter === true) {
      groups.push({ kind: 'frontmatter', blocks: [block] });
    } else if (level !== null && block.headingDepth === level) {
      groups.push({ kind: 'heading', blocks: [block] });
    } else if (current === undefined || current.kind === 'frontmatter') {
      groups.push({ kind: 'intro', blocks: [block] });
    } else {
      current.blocks.push(block);
    }
  }
  return groups.map((group, index) => {
    const [first] = group.blocks;
    const next = groups[index + 1]?.blocks[0];
    return {
      kind: group.kind,
      range: { start: first?.range.start ?? 0, end: next?.range.start ?? length },
      blocks: group.blocks,
    };
  });
}

export interface SectionPair {
  /** `null` where only the translation has it (an intro or frontmatter the source lacks). */
  readonly source: Section | null;
  /** `null` where the translation doesn't have it yet. */
  readonly target: Section | null;
}

export type SectionPairing =
  | {
      readonly paired: true;
      /** The source's split level, which the translation is split at too. */
      readonly level: number | null;
      /** Every section, in order: frontmatter, intro, then the heading sections. */
      readonly pairs: readonly SectionPair[];
    }
  | {
      readonly paired: false;
      readonly level: number;
      /**
       * `level`: the translation's own headings sit at another level (or it has none);
       * `count`: it has a different number of headings at the source's level.
       */
      readonly reason: 'level' | 'count';
      readonly sourceCount: number;
      readonly targetCount: number;
      /** The translation's own split level. */
      readonly targetLevel: number | null;
      /** The frontmatter and intro only: they pair by place. Headings aren't guessed at. */
      readonly pairs: readonly SectionPair[];
    };

/** The source's and translation's sections, paired in order when their headings line up. */
export function pairSections(
  source: { readonly blocks: readonly OutlineBlock[]; readonly length: number },
  target: { readonly blocks: readonly OutlineBlock[]; readonly length: number },
): SectionPairing {
  const level = splitLevel(source.blocks);
  const sourceSections = sectionsAt(source.blocks, source.length, level);
  const targetSections = sectionsAt(target.blocks, target.length, level);
  const ofKind = (sections: readonly Section[], kind: SectionKind) =>
    sections.filter((section) => section.kind === kind);

  const pairs: SectionPair[] = [];
  for (const kind of ['frontmatter', 'intro'] as const) {
    const [sourceSection = null] = ofKind(sourceSections, kind);
    const [targetSection = null] = ofKind(targetSections, kind);
    if (sourceSection !== null || targetSection !== null) {
      pairs.push({ source: sourceSection, target: targetSection });
    }
  }

  const sourceHeadings = ofKind(sourceSections, 'heading');
  const targetHeadings = ofKind(targetSections, 'heading');
  if (level === null || sourceHeadings.length === targetHeadings.length) {
    sourceHeadings.forEach((section, index) => {
      pairs.push({ source: section, target: targetHeadings[index] ?? null });
    });
    return { paired: true, level, pairs };
  }
  const targetLevel = splitLevel(target.blocks);
  return {
    paired: false,
    level,
    reason: targetLevel === level ? 'count' : 'level',
    sourceCount: sourceHeadings.length,
    targetCount: targetHeadings.length,
    targetLevel,
    pairs,
  };
}
