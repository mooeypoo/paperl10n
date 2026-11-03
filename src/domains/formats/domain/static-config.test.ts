// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findStaticProperties, type StaticValue } from './static-config.ts';

/** A static value as plain data, to compare: objects and arrays carry `$complete` when false. */
function plain(value: StaticValue): unknown {
  switch (value.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return value.value;
    case 'null':
      return null;
    case 'dynamic':
      return '<dynamic>';
    case 'array': {
      const items = value.items.map(plain);
      return value.complete ? items : [...items, '$incomplete'];
    }
    case 'object': {
      const entries = Object.fromEntries([...value.properties].map(([k, v]) => [k, plain(v)]));
      return value.complete ? entries : { ...entries, $incomplete: true };
    }
  }
}

/** The first `x` property's value in `{ x: <source> }`. */
const valueOf = (source: string) => {
  const [found] = findStaticProperties(`export default { x: ${source} }`, 'x');
  return found === undefined ? undefined : plain(found.value);
};

describe('findStaticProperties: values', () => {
  it.each<[string, string, unknown]>([
    ['a single-quoted string', `'he'`, 'he'],
    ['a double-quoted string', `"he"`, 'he'],
    ['a template without interpolation', '`he`', 'he'],
    ['escapes', String.raw`'it\'s \"x\"\n\t\\ ש\u{1F981} \x41'`, `it's "x"\n\t\\ ש🦁 A`],
    ['a line continuation', "'a\\\nb'", 'ab'],
    ['numbers', '[1, -2.5, .5, 1e3]', [1, -2.5, 0.5, 1000]],
    ['booleans and null', '[true, false, null]', [true, false, null]],
    ['an empty object and array', '[{}, []]', [{}, []]],
    [
      'nested objects',
      `{ a: { b: 'c' }, 'd-e': [1, { f: 2 }] }`,
      { a: { b: 'c' }, 'd-e': [1, { f: 2 }] },
    ],
    ['trailing commas and comments', `{ a: 1, /* b */ // c\n d: 2, }`, { a: 1, d: 2 }],
    ['numeric keys, as JavaScript names them', `{ 1: 'one', 1.50: 'x' }`, { 1: 'one', '1.5': 'x' }],
    ['a repeated key, keeping the last', `{ a: 1, a: 2 }`, { a: 2 }],
    ['brackets inside strings', `{ a: '}', b: "]", c: \`{\` }`, { a: '}', b: ']', c: '{' }],
  ])('reads %s', (_description, source, expected) => {
    expect(valueOf(source)).toEqual(expected);
  });

  it.each<[string, string, unknown]>([
    ['a variable', 'locales', '<dynamic>'],
    ['a call', `makeLocale('he')`, '<dynamic>'],
    ['an operator after a literal', `'a' + b`, '<dynamic>'],
    ['a member of a literal', `{ a: 1 }.a`, '<dynamic>'],
    ['a template with interpolation', '`${lang}-x`', '<dynamic>'],
    ['an environment variable', 'process.env.LANG', '<dynamic>'],
    ['a quoted string broken by a line', `'a\nb'`, '<dynamic>'],
    ['an escape past the last code point', String.raw`'\u{110000}'`, '<dynamic>'],
    ['an arrow function', `(x) => ({ a: x })`, '<dynamic>'],
    ['a regular expression-free conditional', `cond ? 'a' : 'b'`, '<dynamic>'],
  ])('reads %s as dynamic', (_description, source, expected) => {
    expect(valueOf(source)).toEqual(expected);
  });

  it.each<[string, string, unknown]>([
    ['a spread', `{ ...shared, he: { lang: 'he' } }`, { he: { lang: 'he' }, $incomplete: true }],
    ['a computed key', `{ [key]: 1, b: 2 }`, { b: 2, $incomplete: true }],
    ['a method', `{ a() { return 1 }, b: 2 }`, { b: 2, $incomplete: true }],
    ['a template as a key (not valid)', '{ `a`: 1, b: 2 }', { b: 2, $incomplete: true }],
    ['a shorthand property (a variable)', `{ en, b: 2 }`, { en: '<dynamic>', b: 2 }],
    ['a spread in an array', `[1, ...more, 2]`, [1, 2, '$incomplete']],
    [
      'dynamic parts kept apart',
      `{ label: t('x'), lang: 'he' }`,
      { label: '<dynamic>', lang: 'he' },
    ],
  ])('reads what it can of %s', (_description, source, expected) => {
    expect(valueOf(source)).toEqual(expected);
  });

  it('marks an object or array that never closes as incomplete', () => {
    const [object] = findStaticProperties(`{ x: { a: 1, b: { c: 2 }`, 'x');
    expect(object && plain(object.value)).toEqual({ a: 1, b: { c: 2 }, $incomplete: true });
    const [trailing] = findStaticProperties(`{ x: { a: 1, `, 'x');
    expect(trailing && plain(trailing.value)).toEqual({ a: 1, $incomplete: true });
    const [array] = findStaticProperties(`{ x: [1, 2`, 'x');
    expect(array && plain(array.value)).toEqual([1, 2, '$incomplete']);
  });
});

describe('findStaticProperties: finding', () => {
  it('finds every property with the name, in order, with its depth', () => {
    const text = `export default defineConfig({
      srcDir: 'src',
      locales: { root: { lang: 'en' } },
      themeConfig: { search: { options: { locales: { zh: {} } } } },
    })`;
    expect(
      findStaticProperties(text, 'locales').map(({ value, depth }) => [plain(value), depth]),
    ).toEqual([
      [{ root: { lang: 'en' } }, 2],
      [{ zh: {} }, 5],
    ]);
    expect(findStaticProperties(text, 'srcDir').map(({ value }) => plain(value))).toEqual(['src']);
  });

  it('finds a quoted key, and a key after a comment', () => {
    const text = `{ 'locales': 1, /* x */ "srcDir": 2, // y\n locales: 3 }`;
    expect(findStaticProperties(text, 'locales').map(({ value }) => plain(value))).toEqual([1, 3]);
    expect(findStaticProperties(text, 'srcDir').map(({ value }) => plain(value))).toEqual([2]);
  });

  it.each([
    ['inside a string', `{ a: 'locales: { x: 1 }' }`],
    ['inside a comment', `{ /* locales: 1 */ a: 2 } // locales: 3`],
    ['as a value', `{ a: locales }`],
    ['as part of a longer name', `{ myLocales: 1, locales2: 2 }`],
    ['in a conditional, not a property', `{ a: x ? locales : 2 }`],
    ['as a label or a case', `switch (x) { case locales: break }`],
    ['as a member', `{ a: config.locales }`],
    ['as a shorthand property', `{ locales, a: 1 }`],
  ])('ignores the name %s', (_description, text) => {
    expect(findStaticProperties(text, 'locales')).toEqual([]);
  });

  it('finds nothing in an empty text, and survives unterminated strings and comments', () => {
    expect(findStaticProperties('', 'x')).toEqual([]);
    expect(findStaticProperties(`{ a: 'open`, 'x')).toEqual([]);
    expect(findStaticProperties(`{ /* open`, 'x')).toEqual([]);
    expect(findStaticProperties(`{ x: 'open`, 'x').map(({ value }) => plain(value))).toEqual([
      '<dynamic>',
    ]);
  });
});
