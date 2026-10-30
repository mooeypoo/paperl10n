// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { preservationHints, type Kept, type PreservationHint } from './hints.ts';

/** Kept things from labels: `link:/x/` is a link to `/x/`. */
const kept = (...labels: string[]): Kept[] =>
  labels.map((label) => {
    const [kind = '', ...value] = label.split(':');
    return { kind: kind as Kept['kind'], value: value.join(':') };
  });

describe('preservationHints', () => {
  it.each<[string, Kept[], Kept[], PreservationHint[]]>([
    ['nothing on either side', [], [], []],
    [
      'the same things, in another order',
      kept('link:/a/', 'code-block:ts', 'link:/b/'),
      kept('link:/b/', 'link:/a/', 'code-block:ts'),
      [],
    ],
    [
      'a link missing',
      kept('link:/a/', 'link:/b/'),
      kept('link:/a/'),
      [{ kind: 'link', missing: ['/b/'], extra: [] }],
    ],
    [
      'a link pointing elsewhere: missing and extra',
      kept('link:/a/'),
      kept('link:/z/'),
      [{ kind: 'link', missing: ['/a/'], extra: ['/z/'] }],
    ],
    [
      'repeats count',
      kept('image:x.png', 'image:x.png'),
      kept('image:x.png'),
      [{ kind: 'image', missing: ['x.png'], extra: [] }],
    ],
    [
      'a code block in another language',
      kept('code-block:ts'),
      kept('code-block:js'),
      [{ kind: 'code-block', missing: ['ts'], extra: ['js'] }],
    ],
    [
      'an extra component and a missing frontmatter key, listed in a fixed order',
      kept('frontmatter-key:title', 'frontmatter-key:description'),
      kept('component:Badge', 'frontmatter-key:title'),
      [
        { kind: 'component', missing: [], extra: ['Badge'] },
        { kind: 'frontmatter-key', missing: ['description'], extra: [] },
      ],
    ],
    [
      'values keep their side’s order',
      kept('link:/c/', 'link:/a/', 'link:/b/'),
      kept('link:/z/', 'link:/y/'),
      [{ kind: 'link', missing: ['/c/', '/a/', '/b/'], extra: ['/z/', '/y/'] }],
    ],
    [
      'kinds never mix',
      kept('link:x'),
      kept('image:x'),
      [
        { kind: 'link', missing: ['x'], extra: [] },
        { kind: 'image', missing: [], extra: ['x'] },
      ],
    ],
  ])('%s', (_description, source, translation, expected) => {
    expect(preservationHints(source, translation)).toEqual(expected);
  });
});
