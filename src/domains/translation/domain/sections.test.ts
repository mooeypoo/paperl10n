// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  pairSections,
  sectionsAt,
  splitLevel,
  type OutlineBlock,
  type Section,
} from './sections.ts';

/**
 * A document's outline, for tests: blocks are separated by blank lines; one starting with `---`
 * first is frontmatter, one starting with `#`s and a space is a heading. (The real outline comes
 * from the Markdown parser; this is enough for the rules.)
 */
function outlineOf(text: string): { blocks: OutlineBlock[]; length: number } {
  const blocks: OutlineBlock[] = [];
  for (const match of text.matchAll(/[^\n]+(?:\n[^\n]+)*/g)) {
    const start = match.index;
    const range = { start, end: start + match[0].length };
    const heading = /^(#{1,6}) /.exec(match[0]);
    if (blocks.length === 0 && match[0].startsWith('---')) {
      blocks.push({ range, frontmatter: true });
    } else if (heading?.[1] !== undefined) {
      blocks.push({ range, headingDepth: heading[1].length });
    } else {
      blocks.push({ range });
    }
  }
  return { blocks, length: text.length };
}

const doc = (...blocks: string[]) => blocks.join('\n\n') + '\n';

/** Each section as its kind and text, trimmed. */
const shown = (text: string, sections: readonly (Section | null)[]) =>
  sections.map((section) =>
    section === null
      ? null
      : `${section.kind}: ${text.slice(section.range.start, section.range.end).trim()}`,
  );

describe('splitLevel', () => {
  it.each([
    ['no headings', doc('a', 'b'), null],
    ['one level', doc('## a', 'x', '## b'), 2],
    ['the shallowest level', doc('### a', '## b', '### c', '## d'), 2],
    ['a lone title over sections', doc('# Title', 'x', '## a', '## b'), 2],
    ['a lone title over deeper sections', doc('# Title', '### a', '### b'), 3],
    ['a lone title, then the next depth that appears', doc('# T', '### a', '## b'), 2],
    ['a single heading only', doc('# Title', 'x'), 1],
    ['two titles are sections', doc('# A', '## a', '# B'), 1],
    ['a shallow heading that isn’t first', doc('## a', '# B', '## c'), 1],
    ['frontmatter isn’t a heading', doc('---\ntitle: x\n---', '## a'), 2],
  ])('%s', (_description, text, expected) => {
    expect(splitLevel(outlineOf(text).blocks)).toBe(expected);
  });
});

describe('sectionsAt', () => {
  it.each([
    ['no headings: all intro', doc('a', 'b'), null, ['intro: a\n\nb']],
    [
      'frontmatter, intro, and sections',
      doc('---\ntitle: x\n---', 'intro', '## a', 'x', '### deeper', 'y', '## b'),
      2,
      [
        'frontmatter: ---\ntitle: x\n---',
        'intro: intro',
        'heading: ## a\n\nx\n\n### deeper\n\ny',
        'heading: ## b',
      ],
    ],
    ['no intro', doc('## a', '## b'), 2, ['heading: ## a', 'heading: ## b']],
    [
      'a lone title joins the intro',
      doc('# T', 'x', '## a'),
      2,
      ['intro: # T\n\nx', 'heading: ## a'],
    ],
    ['frontmatter only', doc('---\na: 1\n---'), null, ['frontmatter: ---\na: 1\n---']],
    ['an empty document', '', null, []],
  ])('%s', (_description, text, level, expected) => {
    const { blocks, length } = outlineOf(text);
    expect(shown(text, sectionsAt(blocks, length, level))).toEqual(expected);
  });

  it('covers the text from the first block to the end, with no gaps', () => {
    const text = '\n\n' + doc('---\na: 1\n---', 'i', '## a', 'x', '## b') + '\n\n';
    const { blocks, length } = outlineOf(text);
    const sections = sectionsAt(blocks, length, 2);
    expect(sections[0]?.range.start).toBe(2);
    expect(sections.at(-1)?.range.end).toBe(length);
    sections.slice(1).forEach((section, index) => {
      expect(section.range.start).toBe(sections[index]?.range.end);
    });
  });
});

describe('pairSections', () => {
  const pair = (source: string, target: string) => {
    const pairing = pairSections(outlineOf(source), outlineOf(target));
    return {
      ...pairing,
      pairs: pairing.pairs.map((p) => [...shown(source, [p.source]), ...shown(target, [p.target])]),
    };
  };

  it('pairs sections in order when their headings line up', () => {
    expect(
      pair(
        doc('---\ntitle: a\n---', 'intro', '## A', '### deeper', '## B'),
        doc('---\ntitle: א\n---', 'מבוא', 'עוד', '## א', '## ב', '### עמוק'),
      ),
    ).toEqual({
      paired: true,
      level: 2,
      pairs: [
        ['frontmatter: ---\ntitle: a\n---', 'frontmatter: ---\ntitle: א\n---'],
        ['intro: intro', 'intro: מבוא\n\nעוד'],
        ['heading: ## A\n\n### deeper', 'heading: ## א'],
        ['heading: ## B', 'heading: ## ב\n\n### עמוק'],
      ],
    });
  });

  it.each<[string, string, string, object]>([
    [
      'a translation without an intro',
      doc('intro', '## A'),
      doc('## א'),
      {
        paired: true,
        pairs: [
          ['intro: intro', null],
          ['heading: ## A', 'heading: ## א'],
        ],
      },
    ],
    [
      'an intro only the translation has',
      doc('## A'),
      doc('מבוא', '## א'),
      {
        paired: true,
        pairs: [
          [null, 'intro: מבוא'],
          ['heading: ## A', 'heading: ## א'],
        ],
      },
    ],
    [
      'a source without headings: the whole body pairs',
      doc('a', 'b'),
      doc('א', '## ב'),
      { paired: true, level: null, pairs: [['intro: a\n\nb', 'intro: א\n\n## ב']] },
    ],
    [
      'a lone title in both',
      doc('# Title', '## A'),
      doc('# כותרת', '## א'),
      {
        paired: true,
        pairs: [
          ['intro: # Title', 'intro: # כותרת'],
          ['heading: ## A', 'heading: ## א'],
        ],
      },
    ],
  ])('%s', (_description, source, target, expected) => {
    expect(pair(source, target)).toMatchObject(expected);
  });

  it.each([
    [
      'a missing section',
      doc('i', '## A', '## B'),
      doc('מ', '## א'),
      { reason: 'count', sourceCount: 2, targetCount: 1, targetLevel: 2 },
    ],
    [
      'an extra section',
      doc('## A'),
      doc('## א', '## ב'),
      { reason: 'count', sourceCount: 1, targetCount: 2, targetLevel: 2 },
    ],
    [
      'headings at another level',
      doc('## A', '## B'),
      doc('### א', '### ב'),
      { reason: 'level', sourceCount: 2, targetCount: 0, targetLevel: 3 },
    ],
    [
      'a translation without headings',
      doc('## A'),
      doc('א'),
      { reason: 'level', sourceCount: 1, targetCount: 0, targetLevel: null },
    ],
  ])('says why sections don’t pair: %s', (_description, source, target, expected) => {
    const pairing = pair(source, target);
    expect(pairing).toMatchObject({ paired: false, level: 2, ...expected });
    // Only the frontmatter and intro pair (by place); headings aren't guessed at.
    expect(pairing.pairs.flat().some((text) => text?.startsWith('heading') === true)).toBe(false);
  });

  it('pairs the frontmatter and intro even when headings don’t line up', () => {
    expect(
      pair(doc('---\na: 1\n---', 'i', '## A', '## B'), doc('---\na: 1\n---', 'מ', '## א')).pairs,
    ).toEqual([
      ['frontmatter: ---\na: 1\n---', 'frontmatter: ---\na: 1\n---'],
      ['intro: i', 'intro: מ'],
    ]);
  });
});
