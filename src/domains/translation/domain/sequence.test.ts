// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { alignSequences, type Step } from './sequence.ts';

/** Steps as text: `=a` same, `+a` added, `-a` removed. */
const shown = (before: string, after: string) =>
  alignSequences(Array.from(before), Array.from(after)).map((step: Step) =>
    step.kind === 'same'
      ? `=${before[step.before] ?? '?'}`
      : step.kind === 'added'
        ? `+${after[step.after] ?? '?'}`
        : `-${before[step.before] ?? '?'}`,
  );

describe('alignSequences', () => {
  it.each([
    ['both empty', '', '', []],
    ['the same', 'abc', 'abc', ['=a', '=b', '=c']],
    ['all added', '', 'ab', ['+a', '+b']],
    ['all removed', 'ab', '', ['-a', '-b']],
    ['one added in the middle', 'ac', 'abc', ['=a', '+b', '=c']],
    ['one removed at the end', 'abc', 'ab', ['=a', '=b', '-c']],
    ['a replacement: the new one first', 'abc', 'axc', ['=a', '+x', '-b', '=c']],
    ['a replaced run', 'abcd', 'axyd', ['=a', '+x', '+y', '-b', '-c', '=d']],
    ['a move', 'abc', 'bca', ['-a', '=b', '=c', '+a']],
    ['repeats', 'aab', 'ab', ['=a', '-a', '=b']],
  ])('%s', (_description, before, after, expected) => {
    expect(shown(before, after)).toEqual(expected);
  });

  it('visits every item of both, in order', () => {
    const before = Array.from('xaybzc');
    const after = Array.from('abqc');
    const steps = alignSequences(before, after);
    expect(steps.flatMap((step) => (step.kind === 'added' ? [] : [step.before]))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(steps.flatMap((step) => (step.kind === 'removed' ? [] : [step.after]))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(steps.filter((step) => step.kind === 'same')).toHaveLength(3);
  });

  it('uses the equality it’s given', () => {
    const steps = alignSequences(['A'], ['a'], (a, b) => a.toLowerCase() === b.toLowerCase());
    expect(steps).toEqual([{ kind: 'same', before: 0, after: 0 }]);
  });
});
