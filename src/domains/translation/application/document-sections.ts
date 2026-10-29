// SPDX-License-Identifier: GPL-3.0-or-later
// Sections of parsed documents: the `document` domain's blocks, as the outline the section rules
// read (translation/domain/sections.ts).
import type { ParsedDocument } from '#domains/document';
import { pairSections, type OutlineBlock, type SectionPairing } from '../domain/sections.ts';

/** A parsed document's top-level blocks, as much of them as sections need. */
export function outlineOf(document: Pick<ParsedDocument, 'blocks' | 'text'>): {
  readonly blocks: readonly OutlineBlock[];
  readonly length: number;
} {
  return {
    blocks: document.blocks.map((block): OutlineBlock => {
      if (block.kind === 'frontmatter') return { range: block.range, frontmatter: true };
      if (block.kind === 'heading' && block.depth !== undefined) {
        return { range: block.range, headingDepth: block.depth };
      }
      return { range: block.range };
    }),
    length: document.text.length,
  };
}

/** A page's source and translation, paired by section (PRD §7.2). */
export function pairDocumentSections(
  source: Pick<ParsedDocument, 'blocks' | 'text'>,
  target: Pick<ParsedDocument, 'blocks' | 'text'>,
): SectionPairing {
  return pairSections(outlineOf(source), outlineOf(target));
}
