// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { scanGettext } from './gettext-syntax.ts';

const texts = (text: string, flags: string[]) => scanGettext(text, flags).map((t) => t.text);

describe('scanGettext', () => {
  it.each<[string, string, string[], string[]]>([
    [
      'printf directives',
      '%s, %d, %1$s, %-5.2f, %lu, %*d',
      ['c-format'],
      ['%s', '%d', '%1$s', '%-5.2f', '%lu', '%*d'],
    ],
    ['printf in objc and php', 'Hi %@ %s', ['php-format'], ['%s']],
    ['not %% as a directive', '100%% of %s', ['c-format'], ['%s']],
    ['Python named and positional', '%(name)s has %d', ['python-format'], ['%(name)s', '%d']],
    [
      'braces',
      '{count} of {0} {name!r:>10}',
      ['python-brace-format'],
      ['{count}', '{0}', '{name!r:>10}'],
    ],
    ['not {{ and }} as fields', '{{literal}} {x}', ['python-brace-format'], ['{x}']],
    ['nothing without a flag', '100% {x} %s', [], []],
    ['nothing for no-c-format', '%s', ['no-c-format'], []],
  ])('finds %s', (_description, text, flags, expected) => {
    expect(texts(text, flags)).toEqual(expected);
  });

  it('finds tags in any message, with lowercase names, nested around directives', () => {
    expect(scanGettext('<B>%s</b> <br/>', ['c-format'])).toEqual([
      { kind: 'tag', name: 'b', text: '<B>', start: 0, end: 3 },
      { kind: 'parameter', text: '%s', start: 3, end: 5 },
      { kind: 'tag', name: 'b', text: '</b>', start: 5, end: 9 },
      { kind: 'tag', name: 'br', text: '<br/>', start: 10, end: 15 },
    ]);
    expect(texts('<a href="%s">x</a>', ['c-format'])).toEqual(['<a href="%s">', '%s', '</a>']);
  });

  it('finds a directive two flags both mark once', () => {
    expect(texts('%s', ['c-format', 'python-format'])).toEqual(['%s']);
  });

  it('drops a token that would partly overlap one before it', () => {
    expect(texts('{<b}>', ['python-brace-format'])).toEqual(['{<b}']);
  });
});
