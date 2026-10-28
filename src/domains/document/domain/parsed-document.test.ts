// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parsedDocumentProblems, type Block, type InlineSpan } from './parsed-document.ts';

const block = (kind: Block['kind'], start: number, end: number, depth?: number): Block =>
  depth === undefined ? { kind, range: { start, end } } : { kind, range: { start, end }, depth };
const span = (kind: InlineSpan['kind'], start: number, end: number): InlineSpan => ({
  kind,
  range: { start, end },
});

const text = '# Title\n\nSome `code` here.\n';
const valid = {
  text,
  blocks: [block('heading', 0, 7, 1), block('paragraph', 9, 26)],
  inline: [span('markup', 0, 1), span('markup', 14, 15), span('code', 15, 19)],
};

describe('parsedDocumentProblems', () => {
  it('accepts a well-formed document (positive control)', () => {
    expect(parsedDocumentProblems(valid)).toEqual([]);
  });

  it('accepts a leading BOM between blocks, and an empty document', () => {
    const withBom = { text: '\uFEFFx', blocks: [block('paragraph', 1, 2)], inline: [] };
    expect(parsedDocumentProblems(withBom)).toEqual([]);
    expect(parsedDocumentProblems({ text: '\n', blocks: [], inline: [] })).toEqual([]);
  });

  it.each<[string, Partial<typeof valid>, string]>([
    [
      'overlapping blocks',
      { blocks: [block('heading', 0, 7, 1), block('paragraph', 5, 26)] },
      'overlaps',
    ],
    [
      'a block past the end',
      { blocks: [block('heading', 0, 7, 1), block('paragraph', 9, 99)] },
      'ends past',
    ],
    [
      'an empty block',
      { blocks: [block('heading', 0, 7, 1), block('paragraph', 9, 9)] },
      'is empty',
    ],
    [
      'text left between blocks',
      { blocks: [block('heading', 0, 7, 1), block('paragraph', 14, 26)] },
      'non-whitespace text before',
    ],
    [
      'text left after the last block',
      { blocks: [block('heading', 0, 7, 1)] },
      'after the last block',
    ],
    [
      'a block with its line ending',
      { blocks: [block('heading', 0, 8, 1), block('paragraph', 9, 26)] },
      'line ending',
    ],
    [
      'a heading without a depth',
      { blocks: [block('heading', 0, 7), block('paragraph', 9, 26)] },
      'only headings',
    ],
    [
      'a paragraph with a depth',
      { blocks: [block('heading', 0, 7, 1), block('paragraph', 9, 26, 2)] },
      'only headings',
    ],
    ['overlapping spans', { inline: [span('markup', 14, 16), span('code', 15, 19)] }, 'overlaps'],
    ['an empty span', { inline: [span('code', 15, 15)] }, 'is empty'],
    ['a span outside every block', { inline: [span('markup', 7, 9)] }, "isn't inside a block"],
  ])('reports %s', (_description, change, problem) => {
    const problems = parsedDocumentProblems({ ...valid, ...change });
    expect(
      problems.some((p) => p.includes(problem)),
      problems.join('; '),
    ).toBe(true);
  });
});
