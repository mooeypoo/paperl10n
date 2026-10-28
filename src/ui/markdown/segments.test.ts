// SPDX-License-Identifier: GPL-3.0-or-later
import type { BlockDto, DocumentTextDto, InlineSpanDto } from '#ipc-contract';
import { describe, expect, it } from 'vitest';
import {
  blockViews,
  isLeftToRightBlock,
  isolatesLeftToRight,
  segmentBlock,
  type Segment,
} from './segments';

const span = (kind: InlineSpanDto['kind'], start: number, end: number): InlineSpanDto => ({
  kind,
  start,
  end,
});

describe('segmentBlock', () => {
  const text = '## Run `npx x` now';
  const block: BlockDto = { kind: 'heading', start: 0, end: text.length, depth: 2 };

  it('splits a block into text and its inline spans, covering every character once', () => {
    const segments = segmentBlock(text, block, [
      span('markup', 0, 2),
      span('markup', 7, 8),
      span('code', 8, 13),
      span('markup', 13, 14),
    ]);
    expect(segments).toEqual([
      { kind: 'markup', text: '##' },
      { kind: 'text', text: ' Run ' },
      { kind: 'markup', text: '`' },
      { kind: 'code', text: 'npx x' },
      { kind: 'markup', text: '`' },
      { kind: 'text', text: ' now' },
    ]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
  });

  it('is all text without spans', () => {
    expect(segmentBlock(text, block, [])).toEqual([{ kind: 'text', text }]);
  });

  it('clips spans to the block and ignores spans outside it', () => {
    const inner: BlockDto = { kind: 'paragraph', start: 3, end: 10 };
    expect(segmentBlock(text, inner, [span('markup', 0, 2), span('code', 8, 13)])).toEqual([
      { kind: 'text', text: 'Run `' },
      { kind: 'code', text: 'np' },
    ]);
  });

  it('keeps bidi marks and line breaks inside the text exactly', () => {
    const hebrew = '‏Lantern הופך\nשורה שנייה';
    const segments = segmentBlock(hebrew, { kind: 'paragraph', start: 0, end: hebrew.length }, []);
    expect(segments[0]?.text).toBe(hebrew);
  });
});

describe('blockViews', () => {
  it('gives each block only its own spans', () => {
    const document: DocumentTextDto = {
      path: 'a.md',
      text: '# A\n\nSee `x`.\n',
      blocks: [
        { kind: 'heading', start: 0, end: 3, depth: 1 },
        { kind: 'paragraph', start: 5, end: 13 },
      ],
      inline: [
        span('markup', 0, 1),
        span('markup', 9, 10),
        span('code', 10, 11),
        span('markup', 11, 12),
      ],
    };
    expect(blockViews(document).map((view) => view.segments)).toEqual([
      [
        { kind: 'markup', text: '#' },
        { kind: 'text', text: ' A' },
      ],
      [
        { kind: 'text', text: 'See ' },
        { kind: 'markup', text: '`' },
        { kind: 'code', text: 'x' },
        { kind: 'markup', text: '`' },
        { kind: 'text', text: '.' },
      ],
    ]);
  });
});

describe('isLeftToRightBlock', () => {
  it.each<[BlockDto['kind'], boolean]>([
    ['code', true],
    ['frontmatter', true],
    ['mdx-esm', true],
    ['paragraph', false],
    ['heading', false],
    ['list', false],
    ['table', false],
  ])('%s → %s', (kind, expected) => {
    expect(isLeftToRightBlock({ kind, start: 0, end: 1 })).toBe(expected);
  });
});

describe('isolatesLeftToRight', () => {
  it.each<[string, Segment, boolean]>([
    ['inline code', { kind: 'code', text: 'docs/' }, true],
    ['a link destination', { kind: 'url', text: 'https://nodejs.org/' }, true],
    ['a component tag', { kind: 'markup', text: '<Badge text="New" />' }, true],
    ['an HTML tag', { kind: 'markup', text: '</kbd>' }, true],
    ['emphasis marks', { kind: 'markup', text: '**' }, false],
    ['link brackets', { kind: 'markup', text: '](' }, false],
    ['a heading mark', { kind: 'markup', text: '##' }, false],
    ['prose', { kind: 'text', text: 'Lantern' }, false],
  ])('%s → %s', (_description, segment, expected) => {
    expect(isolatesLeftToRight(segment, { kind: 'paragraph', start: 0, end: 1 })).toBe(expected);
  });

  it('never isolates inside code and data blocks, which take direction line by line', () => {
    for (const kind of ['code', 'frontmatter', 'mdx-esm'] as const) {
      expect(
        isolatesLeftToRight({ kind: 'code', text: 'זה הדף' }, { kind, start: 0, end: 1 }),
      ).toBe(false);
    }
  });
});
