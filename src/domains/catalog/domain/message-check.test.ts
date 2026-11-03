// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  checkForms,
  checkMessage,
  type MessageWarning,
  type ScannedText,
} from './message-check.ts';
import type { PlaceholderToken } from './placeholder.ts';

// Offsets don't matter to the check; tokens are written by hand, as a plugin would find them.
const at = (text: string) => ({ text, start: 0, end: text.length });
const parameter = (text: string): PlaceholderToken => ({ kind: 'parameter', ...at(text) });
const plural = (p: string): PlaceholderToken => ({
  kind: 'plural',
  parameter: p,
  ...at(`{{PLURAL:${p}|…}}`),
});
const gender = (p: string): PlaceholderToken => ({
  kind: 'gender',
  parameter: p,
  ...at(`{{GENDER:${p}|…}}`),
});
const link = (target: string): PlaceholderToken => ({
  kind: 'link',
  target,
  ...at(`[[${target}]]`),
});
const tag = (name: string, text = `<${name}>`): PlaceholderToken => ({
  kind: 'tag',
  name,
  ...at(text),
});
const other = (text: string): PlaceholderToken => ({ kind: 'other', ...at(text) });

const scanned = (text: string, ...tokens: PlaceholderToken[]): ScannedText => ({ text, tokens });

describe('checkMessage', () => {
  it.each<[string, ScannedText, ScannedText, MessageWarning[]]>([
    ['nothing to keep', scanned('Hello'), scanned('שלום'), []],
    [
      'the same tokens, in another order',
      scanned('$1 $2', parameter('$1'), parameter('$2')),
      scanned('$2 $1', parameter('$2'), parameter('$1')),
      [],
    ],
    [
      'a parameter used once instead of twice',
      scanned('$1 of $1', parameter('$1'), parameter('$1')),
      scanned('$1', parameter('$1')),
      [],
    ],
    [
      'a missing parameter',
      scanned('$1 and $2', parameter('$1'), parameter('$2')),
      scanned('$1', parameter('$1')),
      [{ kind: 'missing', token: 'parameter', value: '$2' }],
    ],
    [
      'an unexpected parameter',
      scanned('$1', parameter('$1')),
      scanned('$1 $3', parameter('$1'), parameter('$3')),
      [{ kind: 'unexpected', token: 'parameter', value: '$3' }],
    ],
    [
      'a missing plural',
      scanned('x', plural('$1'), parameter('$1')),
      scanned('$1', parameter('$1')),
      [{ kind: 'missing', token: 'plural', value: '$1' }],
    ],
    [
      'a plural on another parameter',
      scanned('x', plural('$1')),
      scanned('x', plural('$2')),
      [{ kind: 'missing', token: 'plural', value: '$1' }],
    ],
    [
      'an added plural (a language may need one)',
      scanned('$1 items', parameter('$1')),
      scanned('x', plural('$1'), parameter('$1')),
      [],
    ],
    [
      'a missing gender',
      scanned('x', gender('$1')),
      scanned('x'),
      [{ kind: 'missing', token: 'gender', value: '$1' }],
    ],
    [
      'a missing gender of the reader',
      scanned('x', gender('')),
      scanned('x'),
      [{ kind: 'missing', token: 'gender', value: '' }],
    ],
    ['an added gender', scanned('x'), scanned('x', gender('$1')), []],
    [
      'a link to another page',
      scanned('x', link('Help')),
      scanned('x', link('עזרה')),
      [
        { kind: 'missing', token: 'link', value: 'Help' },
        { kind: 'unexpected', token: 'link', value: 'עזרה' },
      ],
    ],
    [
      'a link with other text, same target',
      scanned('x', link('Help')),
      scanned('y', { kind: 'link', target: 'Help', ...at('[[Help|עזרה]]') }),
      [],
    ],
    [
      'tags by name, whatever their attributes',
      scanned('x', tag('a', '<a href="x">'), tag('a', '</a>')),
      scanned('y', tag('a', '<a href="y">'), tag('a', '</a>')),
      [],
    ],
    [
      'a missing tag',
      scanned('x', tag('b'), tag('strong')),
      scanned('x', tag('b')),
      [{ kind: 'missing', token: 'tag', value: 'strong' }],
    ],
    [
      'an unexpected tag',
      scanned('x'),
      scanned('x', tag('i')),
      [{ kind: 'unexpected', token: 'tag', value: 'i' }],
    ],
    [
      'a missing magic word',
      scanned('x', other('{{SITENAME}}')),
      scanned('x'),
      [{ kind: 'missing', token: 'other', value: '{{SITENAME}}' }],
    ],
    [
      'a parameter and an other with the same text are different kinds',
      scanned('x', parameter('{n}')),
      scanned('x', other('{n}')),
      [
        { kind: 'missing', token: 'parameter', value: '{n}' },
        { kind: 'unexpected', token: 'other', value: '{n}' },
      ],
    ],
    [
      'unclosed braces',
      scanned('{{PLURAL:$1|a|b}}'),
      scanned('{{PLURAL:$1|a|b}'),
      [{ kind: 'unbalanced', brackets: '{}' }],
    ],
    [
      'unclosed brackets',
      scanned('[[Help]]'),
      scanned('[[Help]'),
      [{ kind: 'unbalanced', brackets: '[]' }],
    ],
    ['brackets unbalanced as in the source', scanned('a { b'), scanned('א { ב'), []],
    ['an empty translation (nothing to check)', scanned('$1', parameter('$1')), scanned(''), []],
  ])('%s', (_name, source, translation, expected) => {
    expect(checkMessage(source, translation)).toEqual(expected);
  });

  it('lists warnings in order: missing by the source, unexpected by the translation, then brackets', () => {
    const source = scanned('$2 $1 {', parameter('$2'), parameter('$1'));
    const translation = scanned('$4 $3', parameter('$4'), parameter('$3'));
    expect(checkMessage(source, translation)).toEqual([
      { kind: 'missing', token: 'parameter', value: '$2' },
      { kind: 'missing', token: 'parameter', value: '$1' },
      { kind: 'unexpected', token: 'parameter', value: '$4' },
      { kind: 'unexpected', token: 'parameter', value: '$3' },
      { kind: 'unbalanced', brackets: '{}' },
    ]);
  });

  it('reports each missing token once', () => {
    expect(checkMessage(scanned('x', parameter('$1'), parameter('$1')), scanned('y'))).toEqual([
      { kind: 'missing', token: 'parameter', value: '$1' },
    ]);
  });
});

describe('checkForms', () => {
  const d = parameter('%d');
  const s = parameter('%s');
  const source = [scanned('%d lamp in %s', d, s), scanned('%d lamps in %s', d, s)];

  it('finds nothing to warn about when the forms keep what the plural has', () => {
    expect(
      checkForms(source, [
        scanned('מנורה אחת ב-%s', s),
        scanned('שתי מנורות ב-%s', s),
        scanned('%d מנורות ב-%s', d, s),
      ]),
    ).toEqual([[], [], []]);
  });

  it('lets a form drop a token another form keeps, and says so on the last form when none does', () => {
    expect(checkForms(source, [scanned('מנורה אחת', s), scanned('%d מנורות', d)])).toEqual([
      [],
      [],
    ]);
    expect(checkForms(source, [scanned('מנורה'), scanned('מנורות', s)])).toEqual([
      [],
      [{ kind: 'missing', token: 'parameter', value: '%d' }],
    ]);
  });

  it('warns about a token no source form has, on the form that has it', () => {
    expect(
      checkForms(source, [scanned('%u', parameter('%u'), d, s), scanned('%d %s', d, s)]),
    ).toEqual([[{ kind: 'unexpected', token: 'parameter', value: '%u' }], []]);
    // A token only the singular has isn't unexpected in a translation form.
    const singularOnly = [scanned('<b>one</b>', tag('b')), scanned('%d', d)];
    expect(checkForms(singularOnly, [scanned('<b>א</b>', tag('b')), scanned('%d', d)])).toEqual([
      [],
      [],
    ]);
  });

  it('checks each form’s brackets against the plural’s', () => {
    expect(checkForms(source, [scanned('{ %d %s', d, s), scanned('%d %s', d, s)])).toEqual([
      [{ kind: 'unbalanced', brackets: '{}' }],
      [],
    ]);
  });

  it('has nothing to check in an empty form, and says what’s missing on the last that isn’t', () => {
    expect(checkForms(source, [scanned('%d %s', d, s), scanned('')])).toEqual([[], []]);
    expect(checkForms(source, [scanned('מנורה'), scanned('')])).toEqual([
      [
        { kind: 'missing', token: 'parameter', value: '%d' },
        { kind: 'missing', token: 'parameter', value: '%s' },
      ],
      [],
    ]);
    const open = [scanned('{one'), scanned('{many')];
    expect(checkForms(open, [scanned('{אחת'), scanned('')])).toEqual([[], []]);
  });

  it('lets a form add a plural or a gender, and compares brackets with the source’s, not zero', () => {
    const p = plural('$1');
    expect(
      checkForms([scanned('$1', parameter('$1'))], [scanned('x $1', parameter('$1'), p)]),
    ).toEqual([[]]);
    expect(checkForms([scanned('{a'), scanned('{b')], [scanned('{א'), scanned('{ב')])).toEqual([
      [],
      [],
    ]);
  });

  it('checks against nothing when the source has no forms', () => {
    expect(checkForms([], [scanned('%d', d)])).toEqual([
      [{ kind: 'unexpected', token: 'parameter', value: '%d' }],
    ]);
  });
});
