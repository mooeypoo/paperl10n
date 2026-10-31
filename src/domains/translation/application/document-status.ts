// SPDX-License-Identifier: GPL-3.0-or-later
// Status of parsed documents: a source document's sections, fingerprinted, as status reads them
// (translation/domain/status.ts), and what changed in them, by place in the text.
import type { ParsedDocument } from '#domains/document';
import { sourceChanges } from '../domain/changes.ts';
import { blockFingerprint } from '../domain/fingerprint.ts';
import { sectionsAt, splitLevel, type OutlineBlock, type Section } from '../domain/sections.ts';
import type { PageRecord, SectionFingerprints } from '../domain/status.ts';
import { outlineOf } from './document-sections.ts';

function sectionsOf(document: Pick<ParsedDocument, 'blocks' | 'text'>): Section[] {
  const { blocks, length } = outlineOf(document);
  return sectionsAt(blocks, length, splitLevel(blocks));
}

/**
 * A source document's sections, each with its blocks' fingerprints, in the order (and at the split
 * level) the section pairing uses: the pairing's pairs with a source side, in order.
 */
export function sectionFingerprints(
  document: Pick<ParsedDocument, 'blocks' | 'text'>,
): SectionFingerprints[] {
  return sectionsOf(document).map((section) => ({
    kind: section.kind,
    blocks: section.blocks.map((block) =>
      blockFingerprint(document.text.slice(block.range.start, block.range.end)),
    ),
  }));
}

/** A source block changed or new since its section was marked up to date. */
export interface ChangedBlock {
  readonly kind: 'changed' | 'added';
  readonly range: OutlineBlock['range'];
}

/** Where marked text was removed: before the block that starts at `offset`, or after the one ending there. */
export interface Removal {
  readonly offset: number;
  readonly side: 'before' | 'after';
}

/** What changed in a source document since its sections were marked, by place in its text. */
export interface DocumentChanges {
  /** In the document's order. */
  readonly blocks: readonly ChangedBlock[];
  readonly removals: readonly Removal[];
}

/** What changed in a source document since its page's record (`null`: never recorded). */
export function documentChanges(
  document: Pick<ParsedDocument, 'blocks' | 'text'>,
  record: PageRecord | null,
): DocumentChanges {
  const sections = sectionsOf(document);
  const changes = sourceChanges(
    sections.map((section) => ({
      kind: section.kind,
      blocks: section.blocks.map((block) =>
        blockFingerprint(document.text.slice(block.range.start, block.range.end)),
      ),
    })),
    record,
  );
  const blocks: ChangedBlock[] = [];
  const removals: Removal[] = changes.removedFirst ? [{ offset: 0, side: 'before' }] : [];
  sections.forEach((section, index) => {
    const { changed = [], added = [], removed = [] } = changes.sections[index] ?? {};
    const kinds = new Map<number, ChangedBlock['kind']>([
      ...changed.map((block) => [block, 'changed'] as const),
      ...added.map((block) => [block, 'added'] as const),
    ]);
    section.blocks.forEach((block, at) => {
      const kind = kinds.get(at);
      if (kind !== undefined) blocks.push({ kind, range: block.range });
    });
    for (const at of removed) {
      const next = section.blocks[at];
      const last = section.blocks.at(-1);
      if (next !== undefined) removals.push({ offset: next.range.start, side: 'before' });
      else removals.push({ offset: last?.range.end ?? section.range.start, side: 'after' });
    }
  });
  return { blocks, removals };
}
