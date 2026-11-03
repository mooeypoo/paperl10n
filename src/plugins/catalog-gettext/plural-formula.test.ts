// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import pluralTable from './plural-forms.json' with { type: 'json' };
import { parsePluralForms, parsePluralFormula, pluralSamples } from './plural-formula.ts';

describe('parsePluralFormula', () => {
  it.each<[string, Record<number, number>]>([
    ['0', { 0: 0, 1: 0, 5: 0 }],
    ['n != 1', { 0: 1, 1: 0, 2: 1 }],
    ['(n > 1)', { 0: 0, 1: 0, 2: 1 }],
    ['n == 1 ? 0 : n == 2 ? 1 : 2', { 1: 0, 2: 1, 3: 2, 0: 2 }],
    ['(n == 1) ? 0 : ((n == 2) ? 1 : 2)', { 1: 0, 2: 1, 3: 2 }],
    [
      'n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2',
      { 1: 0, 11: 2, 21: 0, 2: 1, 12: 2, 22: 1, 5: 2 },
    ],
    ['!(n == 1)', { 1: 0, 2: 1 }],
    ['-n + 3 * 2 - 10 / 3 % 2', { 0: 5, 1: 4 }],
    ['n / 0 + n % 0', { 7: 0 }],
    ['n < 2 || n >= 10 && n <= 20', { 1: 1, 2: 0, 15: 1, 21: 0 }],
  ])('evaluates %s', (formula, expected) => {
    const parsed = parsePluralFormula(formula);
    if (parsed === null) throw new Error(`not parsed: ${formula}`);
    for (const [n, form] of Object.entries(expected)) expect(parsed(Number(n)), n).toBe(form);
  });

  it.each(['', 'n ==', '(n', 'n)', 'm == 1', 'n ? 1', 'n ? 1 :', 'alert(1)', 'n; 1', '1 2'])(
    'refuses %j',
    (formula) => {
      expect(parsePluralFormula(formula)).toBeNull();
    },
  );
});

describe('parsePluralForms', () => {
  it('reads a Plural-Forms value', () => {
    const rule = parsePluralForms('nplurals=3; plural=(n == 1) ? 0 : ((n == 2) ? 1 : 2);');
    expect(rule?.count).toBe(3);
    expect(rule?.expression).toBe('(n == 1) ? 0 : ((n == 2) ? 1 : 2)');
    expect(rule?.formula(2)).toBe(1);
    expect(parsePluralForms('plural=n != 1; nplurals=2')?.count).toBe(2);
  });

  it.each([
    'nplurals=INTEGER; plural=EXPRESSION;',
    'nplurals=2;',
    'plural=n != 1;',
    'nplurals=0; plural=0;',
  ])('refuses %j', (value) => {
    expect(parsePluralForms(value)).toBeNull();
  });
});

describe('pluralSamples', () => {
  it.each<[string, number[][]]>([
    ['nplurals=1; plural=0;', [[0, 1, 2, 3]]],
    ['nplurals=2; plural=n != 1;', [[1], [0, 2, 3, 4]]],
    ['nplurals=3; plural=n==1 ? 0 : n==2 ? 1 : 2;', [[1], [2], [0, 3, 4, 5]]],
    // French's "many" is a million.
    [
      'nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;',
      [
        [0, 1],
        [1000000, 2000000],
        [2, 3, 4, 5],
      ],
    ],
    ['nplurals=3; plural=n == 1 ? 0 : 1;', [[1], [0, 2, 3, 4], []]],
  ])('gives the first counts of each form of %s', (value, samples) => {
    const rule = parsePluralForms(value);
    if (rule === null) throw new Error('test setup');
    expect(pluralSamples(rule)).toEqual(samples);
  });

  it('reads every formula in the CLDR table, each form reached by some count', () => {
    for (const [name, { plurals, formula }] of Object.entries(pluralTable.languages)) {
      const rule = parsePluralForms(`nplurals=${String(plurals)}; plural=${formula};`);
      expect(rule, name).not.toBeNull();
      if (rule === null) continue;
      expect(
        pluralSamples(rule).every((samples) => samples.length > 0),
        name,
      ).toBe(true);
    }
  });
});
