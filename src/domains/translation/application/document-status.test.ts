// SPDX-License-Identifier: GPL-3.0-or-later
import type { Block, ParsedDocument } from '#domains/document';
import { describe, expect, it } from 'vitest';
import { blockFingerprint } from '../domain/fingerprint.ts';
import { pairDocumentSections } from './document-sections.ts';
import { sectionFingerprints } from './document-status.ts';

/** A parsed document from its blocks' kinds and texts, joined by blank lines. */
function parsed(...parts: [Block['kind'], string, number?][]): ParsedDocument {
  let text = '';
  const blocks: Block[] = parts.map(([kind, part, depth]) => {
    if (text !== '') text += '\n\n';
    const range = { start: text.length, end: text.length + part.length };
    text += part;
    return depth === undefined ? { kind, range } : { kind, range, depth };
  });
  return { text: `${text}\n`, blocks, inline: [] };
}

describe('sectionFingerprints', () => {
  const document = parsed(
    ['frontmatter', '---\ntitle: a\n---'],
    ['heading', '# Title', 1],
    ['paragraph', 'Intro.'],
    ['heading', '## A', 2],
    ['code', '```\n## not a heading\n```'],
    ['heading', '### Deeper', 3],
    ['heading', '## B', 2],
  );

  it('fingerprints each block of each section, split as the pairing splits', () => {
    expect(sectionFingerprints(document)).toEqual([
      { kind: 'frontmatter', blocks: [blockFingerprint('---\ntitle: a\n---')] },
      { kind: 'intro', blocks: [blockFingerprint('# Title'), blockFingerprint('Intro.')] },
      {
        kind: 'heading',
        blocks: [
          blockFingerprint('## A'),
          blockFingerprint('```\n## not a heading\n```'),
          blockFingerprint('### Deeper'),
        ],
      },
      { kind: 'heading', blocks: [blockFingerprint('## B')] },
    ]);
  });

  it('lists the sections the pairing pairs, in order', () => {
    const pairing = pairDocumentSections(document, document);
    expect(sectionFingerprints(document).map((section) => section.kind)).toEqual(
      pairing.pairs.map((pair) => pair.source?.kind),
    );
  });

  it('gives the same fingerprints to a CRLF copy', () => {
    const crlf = { ...document, text: document.text.replaceAll('\n', '\r\n') };
    // The same blocks, each shifted by the CRs before it and stretched by those inside it.
    const crs = (end: number) => document.text.slice(0, end).split('\n').length - 1;
    const blocks = document.blocks.map((block) => ({
      ...block,
      range: {
        start: block.range.start + crs(block.range.start),
        end: block.range.end + crs(block.range.end),
      },
    }));
    expect(sectionFingerprints({ ...crlf, blocks })).toEqual(sectionFingerprints(document));
  });
});
