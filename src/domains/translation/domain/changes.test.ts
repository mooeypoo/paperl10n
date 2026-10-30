// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { sourceChanges, type SectionChanges } from './changes.ts';
import { markSections, type PageRecord, type SectionFingerprints } from './status.ts';

/** As in status.test.ts: each section is its blocks, split at spaces; `#…` starts a heading section. */
const page = (...sections: string[]): SectionFingerprints[] =>
  sections.map((section) => {
    const blocks = section.split(' ');
    const [first = ''] = blocks;
    return {
      kind: first.startsWith('#') ? 'heading' : first === 'fm' ? 'frontmatter' : 'intro',
      blocks,
    };
  });

const marked = (...sections: string[]) => markSections(page(...sections), null, 'all');

/** A section's changes, with only the lists that aren't empty. */
const changes = (changed: number[] = [], added: number[] = [], removed: number[] = []) =>
  ({ changed, added, removed }) satisfies SectionChanges;
const same = changes();

describe('sourceChanges', () => {
  it.each<[string, PageRecord | null, SectionFingerprints[], SectionChanges[]]>([
    ['a page never recorded: nothing to compare', null, page('i', '#A a'), [same, same]],
    ['unchanged', marked('i', '#A a b'), page('i', '#A a b'), [same, same]],
    ['a block changed', marked('#A a b c'), page('#A a b2 c'), [changes([2])]],
    ['a block added', marked('#A a c'), page('#A a b c'), [changes([], [2])]],
    ['a block added at the end', marked('#A a'), page('#A a b'), [changes([], [2])]],
    ['a block removed', marked('#A a b c'), page('#A a c'), [changes([], [], [2])]],
    ['a block removed at the end', marked('#A a b'), page('#A a'), [changes([], [], [2])]],
    [
      'two blocks replaced by one: changed, and a removal after it',
      marked('#A a b c'),
      page('#A x'),
      [changes([1], [], [2])],
    ],
    [
      'one block replaced by two: changed, then added',
      marked('#A a'),
      page('#A x y'),
      [changes([1], [2])],
    ],
    ['a heading changed', marked('#A a', '#B b'), page('#A a', '#B2 b'), [same, changes([0])]],
    [
      'a section new since the record: all of it',
      marked('#A a'),
      page('#A a', '#B b c'),
      [same, changes([], [0, 1, 2])],
    ],
    [
      'a section removed: at the end of the one before',
      marked('#A a', '#B b', '#C c'),
      page('#A a', '#C c'),
      [changes([], [], [2]), same],
    ],
    [
      'the first sections removed: before the new first',
      marked('i', '#A a', '#B b'),
      page('#B b'),
      [changes([], [], [0])],
    ],
    [
      'a block and the section after it removed: one removal',
      marked('#A a b', '#B b'),
      page('#A a'),
      [changes([], [], [2])],
    ],
  ])('%s', (_description, record, current, sections) => {
    expect(sourceChanges(current, record)).toEqual({ sections, removedFirst: false });
  });

  it('shows nothing in a section never marked, but shows a marked one removed after it', () => {
    const record = markSections(page('#A a', '#B b', '#C c'), null, new Set([1]));
    expect(sourceChanges(page('#A a2', '#C c'), record).sections).toEqual([
      changes([], [], [2]),
      same,
    ]);
    // A removed section never marked isn't shown.
    const unmarked = markSections(page('#A a', '#B b'), null, new Set([0]));
    expect(sourceChanges(page('#A a'), unmarked).sections).toEqual([same]);
  });

  it('shows a section new since the record, and not marked since, as all new', () => {
    const record = markSections(page('#A a', '#B b'), marked('#A a'), new Set([0]));
    expect(sourceChanges(page('#A a', '#B b'), record).sections).toEqual([
      same,
      changes([], [0, 1]),
    ]);
  });

  it('keeps showing a section’s old changes after another section is marked', () => {
    const current = page('#A a2', '#B b2');
    const record = markSections(current, marked('#A a', '#B b'), new Set([1]));
    expect(sourceChanges(current, record).sections).toEqual([changes([1]), same]);
  });

  it('says when marked sections were removed and none are left', () => {
    expect(sourceChanges(page(), marked('#A a'))).toEqual({ sections: [], removedFirst: true });
    expect(sourceChanges(page(), marked())).toEqual({ sections: [], removedFirst: false });
  });
});
