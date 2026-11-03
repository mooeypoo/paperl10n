// SPDX-License-Identifier: GPL-3.0-or-later
// gettext's plural formulas (`Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n==2 ? 1 : 2);`): a
// small C expression over `n` that picks a form. Parsed here into a function, never `eval`ed:
// integers, `n`, parentheses, `! - * / % + < <= > >= == != && || ?:`, with C's precedence and
// integer arithmetic. Anything else is refused.

/** A parsed formula: the form index for a count. */
export type PluralFormula = (n: number) => number;

/** `Plural-Forms`, parsed: how many forms, and which one a count takes. */
export interface PluralRule {
  readonly count: number;
  readonly formula: PluralFormula;
  /** The formula as written (`n != 1`), to write into a new file's header. */
  readonly expression: string;
}

const TOKEN = /\s*(?:(\d+)|(n)|(&&|\|\||==|!=|<=|>=|[-+*/%<>!?:()]))/y;

type Token = { kind: 'number'; value: number } | { kind: 'n' } | { kind: 'op'; value: string };

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  for (;;) {
    if (/^\s*$/.test(text.slice(TOKEN.lastIndex))) return tokens;
    const match = TOKEN.exec(text);
    if (match === null) return null;
    if (match[1] !== undefined) tokens.push({ kind: 'number', value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ kind: 'n' });
    else tokens.push({ kind: 'op', value: match[3] ?? '' });
  }
}

/** Binary operators by precedence, loosest first (C's, below `?:`). */
const LEVELS: readonly (readonly string[])[] = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
];

type Node = (n: number) => number;

function apply(op: string, a: number, b: number): number {
  switch (op) {
    case '||':
      return a !== 0 || b !== 0 ? 1 : 0;
    case '&&':
      return a !== 0 && b !== 0 ? 1 : 0;
    case '==':
      return a === b ? 1 : 0;
    case '!=':
      return a !== b ? 1 : 0;
    case '<':
      return a < b ? 1 : 0;
    case '<=':
      return a <= b ? 1 : 0;
    case '>':
      return a > b ? 1 : 0;
    case '>=':
      return a >= b ? 1 : 0;
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    // Integer division and remainder, as C's unsigned long; by zero gives 0 rather than a trap.
    case '/':
      return b === 0 ? 0 : Math.trunc(a / b);
    default:
      return b === 0 ? 0 : a % b;
  }
}

/** The formula `text` as a function, or `null` when it isn't one gettext would accept. */
export function parsePluralFormula(text: string): PluralFormula | null {
  const read = tokenize(text);
  if (read === null || read.length === 0) return null;
  const tokens: readonly Token[] = read;
  let at = 0;
  const isOp = (value: string) => {
    const token = tokens[at];
    return token?.kind === 'op' && token.value === value;
  };

  function primary(): Node | null {
    const token = tokens[at];
    if (token === undefined) return null;
    at++;
    if (token.kind === 'number') return () => token.value;
    if (token.kind === 'n') return (n) => n;
    if (token.value === '(') {
      const inner = conditional();
      if (inner === null || !isOp(')')) return null;
      at++;
      return inner;
    }
    if (token.value === '!' || token.value === '-') {
      const operand = primary();
      if (operand === null) return null;
      return token.value === '!' ? (n) => (operand(n) === 0 ? 1 : 0) : (n) => -operand(n);
    }
    return null;
  }

  function binary(level: number): Node | null {
    const operators = LEVELS[level];
    if (operators === undefined) return primary();
    let left = binary(level + 1);
    while (left !== null) {
      const token = tokens[at];
      if (token?.kind !== 'op' || !operators.includes(token.value)) break;
      at++;
      const right = binary(level + 1);
      if (right === null) return null;
      const [a, b, op] = [left, right, token.value];
      left = (n) => apply(op, a(n), b(n));
    }
    return left;
  }

  function conditional(): Node | null {
    const test = binary(0);
    if (test === null || !isOp('?')) return test;
    at++;
    const yes = conditional();
    if (yes === null || !isOp(':')) return null;
    at++;
    const no = conditional();
    if (no === null) return null;
    return (n) => (test(n) !== 0 ? yes(n) : no(n));
  }

  const formula = conditional();
  return formula !== null && at === tokens.length ? formula : null;
}

/** A `Plural-Forms` value (`nplurals=2; plural=(n != 1);`), or `null` if it can't be read. */
export function parsePluralForms(value: string): PluralRule | null {
  const count = /\bnplurals\s*=\s*(\d+)/.exec(value);
  const plural = /\bplural\s*=\s*([^;]+);?/.exec(value);
  if (count?.[1] === undefined || plural?.[1] === undefined) return null;
  const formula = parsePluralFormula(plural[1]);
  const forms = Number(count[1]);
  if (formula === null || forms < 1) return null;
  return { count: forms, formula, expression: plural[1].trim() };
}

/** Counts tried for each form's samples, in order: small ones first, then large ones (French's
 * "many" is a million). */
const CANDIDATES: readonly number[] = [
  ...Array.from({ length: 1001 }, (_, n) => n),
  10000,
  100000,
  1000000,
  2000000,
];
const SAMPLES_PER_FORM = 4;

/** For each form of `rule`, the first few counts that take it. A form no count reaches has none. */
export function pluralSamples(rule: PluralRule): number[][] {
  const samples = Array.from({ length: rule.count }, (): number[] => []);
  for (const n of CANDIDATES) {
    const form = samples[rule.formula(n)];
    if (form !== undefined && form.length < SAMPLES_PER_FORM) form.push(n);
  }
  return samples;
}
