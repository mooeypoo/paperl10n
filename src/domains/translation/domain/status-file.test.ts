// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  emptyStatusFile,
  parseStatusFile,
  serializeStatusFile,
  type StatusFile,
} from './status-file.ts';

const f = (digit: string) => digit.repeat(16);

const status: StatusFile = {
  pages: new Map([
    [
      'guide/install',
      [
        { kind: 'frontmatter', heading: null, marked: [f('1')] },
        { kind: 'intro', heading: null, marked: null },
        { kind: 'heading', heading: f('a'), marked: [f('a'), f('2')] },
        { kind: 'heading', heading: f('b'), marked: [] },
      ],
    ],
    ['about', [{ kind: 'heading', heading: f('c'), marked: null }]],
    ['empty', []],
  ]),
};

const text = `{
  "version": 1,
  "pages": {
    "about": [
      {"kind":"heading","heading":"${f('c')}"}
    ],
    "empty": [],
    "guide/install": [
      {"kind":"frontmatter","blocks":["${f('1')}"]},
      {"kind":"intro"},
      {"kind":"heading","heading":"${f('a')}","blocks":["${f('a')}","${f('2')}"]},
      {"kind":"heading","heading":"${f('b')}","blocks":[]}
    ]
  }
}
`;

describe('serializeStatusFile', () => {
  it('writes pages sorted by key, one section per line', () => {
    expect(serializeStatusFile(status)).toBe(text);
  });

  it('writes an empty status', () => {
    expect(serializeStatusFile(emptyStatusFile)).toBe('{\n  "version": 1,\n  "pages": {}\n}\n');
  });

  it('sorts keys by code unit, not by locale', () => {
    const keys = ['b', 'B', 'a/z', 'a', 'é'];
    const written = serializeStatusFile({ pages: new Map(keys.map((key) => [key, []])) });
    expect([...written.matchAll(/^ {4}"([^"]+)"/gm)].map((match) => match[1])).toEqual([
      'B',
      'a',
      'a/z',
      'b',
      'é',
    ]);
  });
});

describe('parseStatusFile', () => {
  it('reads what was written', () => {
    const read = parseStatusFile(text);
    expect(read).toEqual({ ok: true, value: status });
    if (read.ok) expect(serializeStatusFile(read.value)).toBe(text);
  });

  it('reads any JSON layout, with keys in any order', () => {
    const compact = JSON.stringify({
      pages: { about: [{ heading: f('c'), kind: 'heading', blocks: [f('c')] }] },
      version: 1,
    });
    expect(parseStatusFile(compact)).toEqual({
      ok: true,
      value: {
        pages: new Map([['about', [{ kind: 'heading', heading: f('c'), marked: [f('c')] }]]]),
      },
    });
  });

  it('keeps a page keyed "__proto__" as a page', () => {
    const read = parseStatusFile('{"version":1,"pages":{"__proto__":[]}}');
    expect(read.ok && [...read.value.pages.keys()]).toEqual(['__proto__']);
  });

  it('refuses a newer version', () => {
    expect(parseStatusFile('{"version":2,"pages":{}}')).toEqual({
      ok: false,
      error: { code: 'translation.status-file-unsupported', version: 2 },
    });
  });

  it.each([
    ['not JSON', '{', /^not valid JSON/],
    ['not an object', '[]', 'must be a JSON object'],
    ['no version', '{"pages":{}}', '"version" must be a positive whole number'],
    ['version 0', '{"version":0,"pages":{}}', '"version" must be a positive whole number'],
    [
      'a fractional version',
      '{"version":1.5,"pages":{}}',
      '"version" must be a positive whole number',
    ],
    ['no pages', '{"version":1}', '"pages" must be an object keyed by document key'],
    [
      'pages as a list',
      '{"version":1,"pages":[]}',
      '"pages" must be an object keyed by document key',
    ],
    ['a page not a list', '{"version":1,"pages":{"a":{}}}', 'page "a" must be a list of sections'],
    [
      'a section not an object',
      '{"version":1,"pages":{"a":[1]}}',
      'page "a", section 1 must be an object',
    ],
    [
      'an unknown kind',
      '{"version":1,"pages":{"a":[{"kind":"list"}]}}',
      'page "a", section 1: "kind" must be one of frontmatter, intro, heading',
    ],
    [
      'a heading without its fingerprint',
      '{"version":1,"pages":{"a":[{"kind":"heading"}]}}',
      'page "a", section 1: a heading section needs its "heading" fingerprint',
    ],
    [
      'a heading fingerprint malformed',
      `{"version":1,"pages":{"a":[{"kind":"heading","heading":"${'A'.repeat(16)}"}]}}`,
      'page "a", section 1: a heading section needs its "heading" fingerprint',
    ],
    [
      'a heading on an intro',
      `{"version":1,"pages":{"a":[{"kind":"intro","heading":"${f('1')}"}]}}`,
      'page "a", section 1: only a heading section has a "heading"',
    ],
    [
      'blocks not a list',
      '{"version":1,"pages":{"a":[{"kind":"intro","blocks":"x"}]}}',
      'page "a", section 1: "blocks" must be a list of fingerprints',
    ],
    [
      'a short fingerprint',
      '{"version":1,"pages":{"a":[{"kind":"intro","blocks":["abc"]}]}}',
      'page "a", section 1: "blocks" must be a list of fingerprints',
    ],
    [
      'blocks of null',
      '{"version":1,"pages":{"a":[{"kind":"intro","blocks":null}]}}',
      'page "a", section 1: "blocks" must be a list of fingerprints',
    ],
  ])('refuses %s', (_description, input, problem) => {
    const read = parseStatusFile(input);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe('translation.status-file-invalid');
    if (read.error.code !== 'translation.status-file-invalid') return;
    if (typeof problem === 'string') expect(read.error.problem).toBe(problem);
    else expect(read.error.problem).toMatch(problem);
  });
});
