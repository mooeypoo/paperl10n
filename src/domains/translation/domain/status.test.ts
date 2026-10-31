// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  markSections,
  matchSections,
  pageStatus,
  sectionStatuses,
  type PageRecord,
  type SectionFingerprints,
} from './status.ts';

/**
 * A page's sections, for tests, with labels for fingerprints. Each section is its blocks, split
 * at spaces: one starting with `#` is a heading section (that block is its heading), `fm` is the
 * frontmatter, anything else the intro.
 */
const page = (...sections: string[]): SectionFingerprints[] =>
  sections.map((section) => {
    const blocks = section.split(' ');
    const [first = ''] = blocks;
    return {
      kind: first.startsWith('#') ? 'heading' : first === 'fm' ? 'frontmatter' : 'intro',
      blocks,
    };
  });

const all = 'all' as const;
const marked = (...sections: string[]) => markSections(page(...sections), null, all);

describe('sectionStatuses and pageStatus', () => {
  it.each<[string, PageRecord | null, SectionFingerprints[], string[], string]>([
    ['a page never recorded', null, page('i', '#A a'), ['draft', 'draft'], 'draft'],
    [
      'marked, unchanged',
      marked('i', '#A a', '#B b'),
      page('i', '#A a', '#B b'),
      ['translated', 'translated', 'translated'],
      'translated',
    ],
    [
      'a block changed',
      marked('#A a', '#B b'),
      page('#A a', '#B b2'),
      ['translated', 'outdated'],
      'outdated',
    ],
    [
      'a block added',
      marked('#A a', '#B b'),
      page('#A a', '#B b c'),
      ['translated', 'outdated'],
      'outdated',
    ],
    ['blocks moved', marked('#A a b'), page('#A b a'), ['outdated'], 'outdated'],
    [
      'a heading changed: matched by place',
      marked('#A a', '#B b', '#C c'),
      page('#A a', '#B2 b', '#C c'),
      ['translated', 'outdated', 'translated'],
      'outdated',
    ],
    [
      'a section added',
      marked('#A a'),
      page('#A a', '#B b'),
      ['translated', 'outdated'],
      'outdated',
    ],
    ['an intro added', marked('#A a'), page('i', '#A a'), ['outdated', 'translated'], 'outdated'],
    [
      'frontmatter changed',
      marked('fm', '#A a'),
      page('fm2', '#A a'),
      ['outdated', 'translated'],
      'outdated',
    ],
    [
      'a section removed: the one before it shows it',
      marked('#A a', '#B b', '#C c'),
      page('#A a', '#C c'),
      ['outdated', 'translated'],
      'outdated',
    ],
    [
      'the first section removed: the new first shows it',
      marked('#A a', '#B b'),
      page('#B b'),
      ['outdated'],
      'outdated',
    ],
    [
      'a repeated heading, in order',
      marked('#A a', '#A b'),
      page('#A a', '#A b2'),
      ['translated', 'outdated'],
      'outdated',
    ],
    ['an empty source, as recorded', marked(), page(), [], 'translated'],
  ])('%s', (_description, record, current, sections, status) => {
    expect(sectionStatuses(current, record)).toEqual(sections);
    expect(pageStatus(current, record, true)).toBe(status);
  });

  it('is missing without a translation file, recorded or not', () => {
    expect(pageStatus(page('#A a'), null, false)).toBe('missing');
    expect(pageStatus(page('#A a'), marked('#A a'), false)).toBe('missing');
  });

  it('shows a marked section’s removal on the section before it, even one never marked', () => {
    const record = markSections(page('#A a', '#B b', '#C c'), null, new Set([1]));
    expect(sectionStatuses(page('#A a', '#C c'), record)).toEqual(['outdated', 'draft']);
    expect(pageStatus(page('#A a', '#C c'), record, true)).toBe('outdated');
  });

  it('is outdated when every section was removed from the source', () => {
    expect(pageStatus(page(), marked('#A a'), true)).toBe('outdated');
  });

  it('keeps sections never marked as draft, even when their source changes', () => {
    const record = markSections(page('#A a', '#B b'), null, new Set([0]));
    expect(sectionStatuses(page('#A a', '#B b'), record)).toEqual(['translated', 'draft']);
    expect(pageStatus(page('#A a', '#B b'), record, true)).toBe('draft');
    expect(sectionStatuses(page('#A a', '#B b2'), record)).toEqual(['translated', 'draft']);
    // Removing a section never marked changes nothing.
    expect(sectionStatuses(page('#A a'), record)).toEqual(['translated']);
    expect(pageStatus(page('#A a'), record, true)).toBe('translated');
  });
});

describe('matchSections', () => {
  const recorded = (record: PageRecord, current: SectionFingerprints[]) => {
    const { matches, removedFirst } = matchSections(current, record);
    return {
      matches: matches.map(({ recorded: match, removedBefore, removedAfter }) => [
        match?.marked?.join(' ') ?? null,
        ...(removedBefore.length > 0
          ? [{ before: removedBefore.map((section) => section.marked?.join(' ')) }]
          : []),
        removedAfter.map((section) => section.marked?.join(' ')),
      ]),
      removedFirst: removedFirst.map((section) => section.marked?.join(' ')),
    };
  };

  it.each<[string, PageRecord, SectionFingerprints[], unknown[]]>([
    [
      'by identity',
      marked('i', '#A a', '#B b'),
      page('i', '#A x', '#B y'),
      [
        ['i', []],
        ['#A a', []],
        ['#B b', []],
      ],
    ],
    [
      'a changed heading by place',
      marked('#A a', '#B b'),
      page('#A a', '#X b'),
      [
        ['#A a', []],
        ['#B b', []],
      ],
    ],
    [
      'only the same kind by place',
      marked('i', '#A a'),
      page('fm', '#A a'),
      [
        [null, ['i']],
        ['#A a', []],
      ],
    ],
    [
      'two changed headings, in order',
      marked('#A a', '#B b', '#C c'),
      page('#A a', '#X b', '#Y c'),
      [
        ['#A a', []],
        ['#B b', []],
        ['#C c', []],
      ],
    ],
    [
      'a changed heading and one added',
      marked('#A a', '#B b'),
      page('#X a', '#Y y', '#B b'),
      [
        ['#A a', []],
        [null, []],
        ['#B b', []],
      ],
    ],
    [
      'removed between two',
      marked('#A a', '#B b', '#C c', '#D d'),
      page('#A a', '#D d'),
      [
        ['#A a', ['#B b', '#C c']],
        ['#D d', []],
      ],
    ],
    ['removed at the end', marked('#A a', '#B b'), page('#A a'), [['#A a', ['#B b']]]],
    [
      'removed at the start: before the first',
      marked('#A a', '#B b', '#C c'),
      page('#C c'),
      [['#C c', { before: ['#A a', '#B b'] }, []]],
    ],
  ])('%s', (_description, record, current, matches) => {
    expect(recorded(record, current)).toEqual({ matches, removedFirst: [] });
  });

  it('keeps removed sections apart when the source has none left', () => {
    expect(recorded(marked('#A a', '#B b'), page())).toEqual({
      matches: [],
      removedFirst: ['#A a', '#B b'],
    });
  });
});

describe('markSections', () => {
  const statuses = (record: PageRecord, current: SectionFingerprints[]) =>
    sectionStatuses(current, record);

  it('records the whole page as the source has it now', () => {
    const current = page('fm', 'i', '#A a b');
    expect(markSections(current, marked('#Old x'), all)).toEqual([
      { kind: 'frontmatter', heading: null, marked: ['fm'] },
      { kind: 'intro', heading: null, marked: ['i'] },
      { kind: 'heading', heading: '#A', marked: ['#A', 'a', 'b'] },
    ]);
  });

  it('records the other sections as never marked on a page’s first record', () => {
    expect(markSections(page('i', '#A a', '#B b'), null, new Set([1]))).toEqual([
      { kind: 'intro', heading: null, marked: null },
      { kind: 'heading', heading: '#A', marked: ['#A', 'a'] },
      { kind: 'heading', heading: '#B', marked: null },
    ]);
  });

  it('marks one outdated section, and the others keep their status', () => {
    const current = page('#A a2', '#B b2', '#C c');
    const record = markSections(current, marked('#A a', '#B b', '#C c'), new Set([1]));
    expect(statuses(record, current)).toEqual(['outdated', 'translated', 'translated']);
    // A's old version is kept, so it shows what changed later (S4).
    expect(record[0]?.marked).toEqual(['#A', 'a']);
  });

  it('keeps a section added since outdated until it’s marked', () => {
    const current = page('#A a', '#B b');
    const record = markSections(current, marked('#A a2'), new Set([0]));
    expect(statuses(record, current)).toEqual(['translated', 'outdated']);
    expect(statuses(markSections(current, record, new Set([1])), current)).toEqual([
      'translated',
      'translated',
    ]);
  });

  it('keeps an outdated section under its new heading, so it’s found by identity next time', () => {
    const current = page('#A a', '#B2 b', '#C c');
    const record = markSections(current, marked('#A a', '#B b', '#C c'), new Set([0]));
    expect(record[1]).toEqual({ kind: 'heading', heading: '#B2', marked: ['#B', 'b'] });
    // Even after a section is inserted before it.
    expect(statuses(record, page('#A a', '#N n', '#B2 b', '#C c'))).toEqual([
      'translated',
      'outdated',
      'outdated',
      'translated',
    ]);
  });

  it('clears a removed section when the section that shows it is marked', () => {
    const current = page('#A a', '#C c');
    const before = marked('#A a', '#B b', '#C c');
    const kept = markSections(current, before, new Set([1]));
    expect(statuses(kept, current)).toEqual(['outdated', 'translated']);
    const cleared = markSections(current, kept, new Set([0]));
    expect(statuses(cleared, current)).toEqual(['translated', 'translated']);
    expect(pageStatus(current, cleared, true)).toBe('translated');
  });

  it('drops removed sections that were never marked', () => {
    const record = markSections(page('#A a', '#B b'), null, new Set([0]));
    expect(markSections(page('#A a'), record, new Set<number>())).toEqual([
      { kind: 'heading', heading: '#A', marked: ['#A', 'a'] },
    ]);
  });

  it('keeps marked sections removed before the first one ahead of it, in order', () => {
    expect(markSections(page('#B b'), marked('#A a', '#B b'), new Set<number>())).toEqual([
      { kind: 'heading', heading: '#A', marked: ['#A', 'a'] },
      { kind: 'heading', heading: '#B', marked: ['#B', 'b'] },
    ]);
  });

  it('keeps sections removed before any left, until the page is marked', () => {
    const record = markSections(page(), marked('#A a'), new Set<number>());
    expect(pageStatus(page(), record, true)).toBe('outdated');
    expect(pageStatus(page(), markSections(page(), record, all), true)).toBe('translated');
  });
});
