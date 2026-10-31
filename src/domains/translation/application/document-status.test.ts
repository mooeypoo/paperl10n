// SPDX-License-Identifier: GPL-3.0-or-later
import type { Block, ParsedDocument } from '#domains/document';
import { describe, expect, it } from 'vitest';
import { blockFingerprint } from '../domain/fingerprint.ts';
import { pairDocumentSections } from './document-sections.ts';
import { markSections } from '../domain/status.ts';
import { documentChanges, sectionFingerprints } from './document-status.ts';

/** A parsed document from its blocks' kinds and texts, joined by blank lines. */
function parsed(...parts: [Block['kind'], string, number?][]): ParsedDocument {
  let text = '';
  const blocks: Block[] = parts.map(([kind, part, depth]) => {
    if (text !== '') text += '\n\n';
    const range = { start: text.length, end: text.length + part.length };
    text += part;
    return depth === undefined ? { kind, range } : { kind, range, depth };
  });
  return { text: `${text}\n`, blocks, inline: [], preserved: [] };
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

describe('documentChanges', () => {
  const marked = parsed(
    ['heading', '# Title', 1],
    ['paragraph', 'Intro.'],
    ['heading', '## A', 2],
    ['paragraph', 'One.'],
    ['paragraph', 'Two.'],
    ['heading', '## B', 2],
    ['paragraph', 'Three.'],
  );
  const record = markSections(sectionFingerprints(marked), null, 'all');
  const at = (document: ParsedDocument, text: string) => {
    const start = document.text.indexOf(text);
    return { start, end: start + text.length };
  };

  it('finds nothing for a page never recorded, or one unchanged', () => {
    expect(documentChanges(marked, null)).toEqual({ blocks: [], removals: [] });
    expect(documentChanges(marked, record)).toEqual({ blocks: [], removals: [] });
  });

  it('places changed and new blocks, and removals, in the source’s text', () => {
    const now = parsed(
      ['heading', '# Title', 1],
      ['paragraph', 'Intro, changed.'],
      ['heading', '## A', 2],
      ['paragraph', 'Two.'],
      ['paragraph', 'New.'],
      ['heading', '## B', 2],
    );
    expect(documentChanges(now, record)).toEqual({
      blocks: [
        { kind: 'changed', range: at(now, 'Intro, changed.') },
        { kind: 'added', range: at(now, 'New.') },
      ],
      removals: [
        // "One." was before "Two.", and "Three." at the end of B.
        { offset: at(now, 'Two.').start, side: 'before' },
        { offset: at(now, '## B').end, side: 'after' },
      ],
    });
  });

  it('places a removed section at the end of the one before it', () => {
    const now = parsed(
      ['heading', '# Title', 1],
      ['paragraph', 'Intro.'],
      ['heading', '## B', 2],
      ['paragraph', 'Three.'],
    );
    expect(documentChanges(now, record)).toEqual({
      blocks: [],
      removals: [{ offset: at(now, 'Intro.').end, side: 'after' }],
    });
  });

  it('places a removal at the start when every section was removed', () => {
    const empty = { text: '', blocks: [], inline: [], preserved: [] };
    expect(documentChanges(empty, record)).toEqual({
      blocks: [],
      removals: [{ offset: 0, side: 'before' }],
    });
  });
});
