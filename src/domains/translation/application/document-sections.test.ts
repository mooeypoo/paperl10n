// SPDX-License-Identifier: GPL-3.0-or-later
import type { Block, ParsedDocument } from '#domains/document';
import { describe, expect, it } from 'vitest';
import { outlineOf, pairDocumentSections } from './document-sections.ts';

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

describe('outlineOf', () => {
  it('keeps frontmatter and heading depths, and only the range of other blocks', () => {
    const document = parsed(
      ['frontmatter', '---\ntitle: a\n---'],
      ['paragraph', 'intro'],
      ['heading', '## A', 2],
      ['code', '```\n# not a heading\n```'],
      ['container-fence', ':::note'],
      ['heading', '### B', 3],
    );
    expect(outlineOf(document)).toEqual({
      blocks: [
        { range: { start: 0, end: 16 }, frontmatter: true },
        { range: { start: 18, end: 23 } },
        { range: { start: 25, end: 29 }, headingDepth: 2 },
        { range: { start: 31, end: 54 } },
        { range: { start: 56, end: 63 } },
        { range: { start: 65, end: 70 }, headingDepth: 3 },
      ],
      length: 71,
    });
  });
});

describe('pairDocumentSections', () => {
  it('pairs a page and its translation by section', () => {
    const pairing = pairDocumentSections(
      parsed(['heading', '# Title', 1], ['heading', '## A', 2], ['heading', '## B', 2]),
      parsed(['heading', '# כותרת', 1], ['heading', '## א', 2], ['heading', '## ב', 2]),
    );
    expect(pairing.paired).toBe(true);
    expect(pairing.level).toBe(2);
    expect(pairing.pairs.map((pair) => [pair.source?.kind, pair.target?.kind])).toEqual([
      ['intro', 'intro'],
      ['heading', 'heading'],
      ['heading', 'heading'],
    ]);
  });

  it('says when they don’t pair', () => {
    expect(
      pairDocumentSections(
        parsed(['heading', '## A', 2], ['heading', '## B', 2]),
        parsed(['heading', '## א', 2]),
      ),
    ).toMatchObject({ paired: false, reason: 'count', sourceCount: 2, targetCount: 1 });
  });
});
