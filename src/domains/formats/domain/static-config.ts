// SPDX-License-Identifier: GPL-3.0-or-later
// Reads values from a JavaScript or TypeScript config *without running it*: a plugin never
// executes project code. Plain literals are read (strings, numbers, booleans, null, objects,
// arrays); anything else (a variable, a call, an operator, a template with `${…}`) is `dynamic`.
// An object or array with a part that can't be read (a spread, a computed key, a method) is
// `complete: false`, with what could be read. It's a reader for the plain configs most sites
// write (`astro.config.mjs`, `.vitepress/config.ts`), not a JavaScript parser: what it doesn't
// recognize, it reports as dynamic, never as a wrong value.

/** A value as written in source code, read statically. */
export type StaticValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' }
  | {
      readonly kind: 'object';
      /** The properties that could be read, in order (a repeated key keeps the last value). */
      readonly properties: ReadonlyMap<string, StaticValue>;
      /** `false`: it also has a part that can't be read (a spread, a computed key, a method). */
      readonly complete: boolean;
    }
  | { readonly kind: 'array'; readonly items: readonly StaticValue[]; readonly complete: boolean }
  | { readonly kind: 'dynamic' };

/** A property found in source code (`name: value`), and how deeply it's nested. */
export interface StaticProperty {
  readonly value: StaticValue;
  /** How many brackets (`{`, `[`, `(`) enclose it: 2 inside `defineConfig({ … })`. */
  readonly depth: number;
}

const DYNAMIC: StaticValue = { kind: 'dynamic' };
const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const OPENERS = '{[(';
const CLOSERS = '}])';

/** Index just past the string, template, or comment starting at `i`, or `i` if there's none. */
function skipNonCode(text: string, i: number): number {
  const char = text[i];
  if (char === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i);
    return end === -1 ? text.length : end;
  }
  if (char === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (char === "'" || char === '"' || char === '`') {
    let j = i + 1;
    while (j < text.length && text[j] !== char) j += text[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, text.length);
  }
  return i;
}

/** Index of the next character that isn't whitespace or a comment. */
function skipSpace(text: string, i: number): number {
  let j = i;
  for (;;) {
    while (j < text.length && /\s/.test(text[j] ?? '')) j++;
    if (text[j] === '/' && (text[j + 1] === '/' || text[j + 1] === '*')) j = skipNonCode(text, j);
    else return j;
  }
}

/** Index of the `,` or closing bracket that ends the expression starting at `i` (or the end). */
function skipExpression(text: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < text.length) {
    const skipped = skipNonCode(text, j);
    if (skipped !== j) {
      j = skipped;
      continue;
    }
    const char = text[j] ?? '';
    if (OPENERS.includes(char)) depth++;
    else if (CLOSERS.includes(char)) {
      if (depth === 0) return j;
      depth--;
    } else if (char === ',' && depth === 0) return j;
    j++;
  }
  return j;
}

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
};

/** The string literal starting at `i` (its quote), decoded, and the index past it; `null`: not one. */
function readString(text: string, i: number): { value: string; end: number } | null {
  const quote = text[i];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  let j = i + 1;
  while (j < text.length && text[j] !== quote) {
    const char = text[j] ?? '';
    if (char === '\n' && quote !== '`') return null;
    if (quote === '`' && char === '$' && text[j + 1] === '{') return null; // interpolated
    if (char !== '\\') {
      value += char;
      j++;
      continue;
    }
    const next = text[j + 1] ?? '';
    const unicode = /^u\{([0-9a-fA-F]{1,6})\}|^u([0-9a-fA-F]{4})|^x([0-9a-fA-F]{2})/.exec(
      text.slice(j + 1, j + 10),
    );
    if (unicode !== null) {
      const code = Number.parseInt(unicode[1] ?? unicode[2] ?? unicode[3] ?? '', 16);
      if (code > 0x10ffff) return null;
      value += String.fromCodePoint(code);
      j += 1 + unicode[0].length;
    } else if (next === '\n') {
      j += 2; // a line continuation
    } else {
      value += ESCAPES[next] ?? next;
      j += 2;
    }
  }
  return j < text.length ? { value, end: j + 1 } : null;
}

/** Whether the value ending at `i` ends its expression (a `,`, a closing bracket, or the end). */
function endsHere(text: string, i: number): boolean {
  const next = skipSpace(text, i);
  return next >= text.length || text[next] === ',' || CLOSERS.includes(text[next] ?? '');
}

/** The value starting at `i`, and the index of what follows it (a `,`, a closer, or the end). */
function readValue(text: string, i: number): { value: StaticValue; end: number } {
  const start = skipSpace(text, i);
  const char = text[start] ?? '';
  let literal: { value: StaticValue; end: number } | null = null;
  if (char === '{') literal = readObject(text, start);
  else if (char === '[') literal = readArray(text, start);
  else if (char === "'" || char === '"' || char === '`') {
    const string = readString(text, start);
    if (string !== null)
      literal = { value: { kind: 'string', value: string.value }, end: string.end };
  } else {
    NUMBER.lastIndex = start;
    IDENTIFIER.lastIndex = start;
    const number = NUMBER.exec(text);
    const word = number === null ? IDENTIFIER.exec(text) : null;
    if (number !== null) {
      literal = { value: { kind: 'number', value: Number(number[0]) }, end: NUMBER.lastIndex };
    } else if (word?.[0] === 'true' || word?.[0] === 'false') {
      literal = {
        value: { kind: 'boolean', value: word[0] === 'true' },
        end: IDENTIFIER.lastIndex,
      };
    } else if (word?.[0] === 'null') {
      literal = { value: { kind: 'null' }, end: IDENTIFIER.lastIndex };
    }
  }
  // A literal followed by more (`'a' + b`, `{…}.x`, `1 * n`) is part of an expression.
  if (literal !== null && endsHere(text, literal.end)) {
    return { value: literal.value, end: skipSpace(text, literal.end) };
  }
  return { value: DYNAMIC, end: skipExpression(text, start) };
}

/** A property's key at `i`: an identifier, a string, or a number; `null`: something else. */
function readKey(text: string, i: number): { key: string; end: number } | null {
  const string = readString(text, i);
  if (string !== null && text[i] !== '`') return { key: string.value, end: string.end };
  for (const pattern of [IDENTIFIER, NUMBER]) {
    pattern.lastIndex = i;
    const match = pattern.exec(text);
    if (match !== null) {
      return {
        key: pattern === NUMBER ? String(Number(match[0])) : match[0],
        end: pattern.lastIndex,
      };
    }
  }
  return null;
}

/** The object literal whose `{` is at `open`, and the index past its `}`. */
function readObject(text: string, open: number): { value: StaticValue; end: number } {
  const properties = new Map<string, StaticValue>();
  let complete = true;
  let i = skipSpace(text, open + 1);
  while (i < text.length && text[i] !== '}') {
    const key = readKey(text, i); // `null` for a spread or a computed key
    const after = key === null ? i : skipSpace(text, key.end);
    if (key !== null && text[after] === ':') {
      const { value, end } = readValue(text, after + 1);
      properties.set(key.key, value);
      i = end;
    } else if (key !== null && (text[after] === ',' || text[after] === '}')) {
      properties.set(key.key, DYNAMIC); // shorthand: `{ en }` is a variable
      i = after;
    } else {
      // A spread, a computed key, a method, or a getter: read past it.
      complete = false;
      i = skipExpression(text, i);
    }
    if (text[i] === ',') i = skipSpace(text, i + 1);
    else if (text[i] !== '}') {
      complete = false;
      i = skipExpression(text, i + 1);
      if (text[i] === ',') i = skipSpace(text, i + 1);
      else if (i < text.length && text[i] !== '}') break;
    }
  }
  if (text[i] !== '}') return { value: { kind: 'object', properties, complete: false }, end: i };
  return { value: { kind: 'object', properties, complete }, end: i + 1 };
}

/** The array literal whose `[` is at `open`, and the index past its `]`. */
function readArray(text: string, open: number): { value: StaticValue; end: number } {
  const items: StaticValue[] = [];
  let complete = true;
  let i = skipSpace(text, open + 1);
  while (i < text.length && text[i] !== ']') {
    if (text.startsWith('...', i)) {
      complete = false;
      i = skipExpression(text, i);
    } else {
      const { value, end } = readValue(text, i);
      items.push(value);
      i = end;
    }
    if (text[i] === ',') i = skipSpace(text, i + 1);
    else if (text[i] !== ']') break;
  }
  if (text[i] !== ']') return { value: { kind: 'array', items, complete: false }, end: i };
  return { value: { kind: 'array', items, complete }, end: i + 1 };
}

/**
 * Every property named `name` in `text` (`name: value`, its key bare or quoted, where a property
 * can be: after `{` or `,`), in order, outside strings and comments, with its value read
 * statically and how deeply it's nested.
 */
export function findStaticProperties(text: string, name: string): StaticProperty[] {
  const found: StaticProperty[] = [];
  let depth = 0;
  /** The last character that wasn't space or a comment: a property starts after `{` or `,`. */
  let previous = '';
  let i = 0;
  while (i < text.length) {
    const spaced = skipSpace(text, i);
    if (spaced !== i) {
      i = spaced;
      continue;
    }
    const key = previous === '{' || previous === ',' ? readKey(text, i) : null;
    if (key !== null) {
      const colon = skipSpace(text, key.end);
      if (key.key === name && text[colon] === ':') {
        found.push({ value: readValue(text, colon + 1).value, depth });
      }
      previous = text[key.end - 1] ?? '';
      i = key.end;
      continue;
    }
    const skipped = skipNonCode(text, i);
    if (skipped !== i) {
      previous = text[skipped - 1] ?? '';
      i = skipped;
      continue;
    }
    const char = text[i] ?? '';
    if (OPENERS.includes(char)) depth++;
    else if (CLOSERS.includes(char)) depth = Math.max(0, depth - 1);
    previous = char;
    i++;
  }
  return found;
}
