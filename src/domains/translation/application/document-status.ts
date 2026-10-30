// SPDX-License-Identifier: GPL-3.0-or-later
// Status of parsed documents: a source document's sections, fingerprinted, as status reads them
// (translation/domain/status.ts).
import type { ParsedDocument } from '#domains/document';
import { blockFingerprint } from '../domain/fingerprint.ts';
import { sectionsAt, splitLevel } from '../domain/sections.ts';
import type { SectionFingerprints } from '../domain/status.ts';
import { outlineOf } from './document-sections.ts';

/**
 * A source document's sections, each with its blocks' fingerprints, in the order (and at the split
 * level) the section pairing uses: the pairing's pairs with a source side, in order.
 */
export function sectionFingerprints(
  document: Pick<ParsedDocument, 'blocks' | 'text'>,
): SectionFingerprints[] {
  const { blocks, length } = outlineOf(document);
  return sectionsAt(blocks, length, splitLevel(blocks)).map((section) => ({
    kind: section.kind,
    blocks: section.blocks.map((block) =>
      blockFingerprint(document.text.slice(block.range.start, block.range.end)),
    ),
  }));
}
