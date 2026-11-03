// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { diffWords } from './word-diff';

describe('diffWords', () => {
  it.each<[string, string, string, [string, string][]]>([
    ['nothing changed', 'Light %s', 'Light %s', [['same', 'Light %s']]],
    [
      'a word added',
      'Open file',
      'Open the file',
      [
        ['same', 'Open '],
        ['added', 'the '],
        ['same', 'file'],
      ],
    ],
    [
      'a word removed',
      'Open the file',
      'Open file',
      [
        ['same', 'Open '],
        ['removed', 'the '],
        ['same', 'file'],
      ],
    ],
    [
      'a word replaced',
      'Lanterns',
      'Lantern',
      [
        ['removed', 'Lanterns'],
        ['added', 'Lantern'],
      ],
    ],
    ['everything new', '', 'New text', [['added', 'New text']]],
    ['everything gone', 'Old text', '', [['removed', 'Old text']]],
    [
      'Hebrew, and spaces kept',
      'שלום  עולם',
      'שלום עולם יפה',
      [
        ['same', 'שלום'],
        ['removed', '  '],
        ['added', ' '],
        ['same', 'עולם'],
        ['added', ' יפה'],
      ],
    ],
  ])('marks %s', (_description, before, after, expected) => {
    const segments = diffWords(before, after);
    expect(segments.map((s) => [s.kind, s.text])).toEqual(expected);
    // Either text joins back from its segments.
    const join = (skip: string) =>
      segments
        .filter((s) => s.kind !== skip)
        .map((s) => s.text)
        .join('');
    expect(join('added')).toBe(before);
    expect(join('removed')).toBe(after);
  });
});
