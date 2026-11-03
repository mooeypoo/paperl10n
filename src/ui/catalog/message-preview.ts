// SPDX-License-Identifier: GPL-3.0-or-later
// The plural and gender preview under the message editor (docs/plan/M4-catalogs.md, question 7):
// the translation rendered by banana-i18n itself for sample values, one row per plural form the
// target language has and one per gender. It's the one place a message's syntax is read in the
// renderer, and it's a preview, not a check: main's tokens say where the plurals and genders are.
import Banana from 'banana-i18n';
import type { PlaceholderTokenDto } from '#ipc-contract';

/** The plural categories, in the order banana-i18n takes a plural's forms (as MediaWiki does). */
const CATEGORY_ORDER: readonly Intl.LDMLPluralRule[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

/**
 * Numbers tried for a category's sample, in order: small counts first (1 before 0, so English's
 * "other" shows 2, not an explicit `0=` form), then large and fractional ones, which some
 * categories need (French "many" is a million).
 */
const SAMPLE_CANDIDATES: readonly number[] = [
  ...Array.from({ length: 200 }, (_, at) => at + 1),
  0,
  1000,
  10000,
  100000,
  1000000,
  0.5,
  1.5,
  2.5,
];

export const GENDERS = ['male', 'female', 'unknown'] as const;
export type Gender = (typeof GENDERS)[number];

export interface PluralSample {
  readonly category: Intl.LDMLPluralRule;
  readonly count: number;
}

export type PreviewRow =
  | {
      readonly kind: 'plural';
      readonly category: Intl.LDMLPluralRule;
      readonly count: number;
      readonly text: string;
    }
  | { readonly kind: 'gender'; readonly gender: Gender; readonly text: string };

/** The rows, or `unreadable`: banana-i18n can't render the text (an unclosed `{{`, say). */
export type MessagePreview =
  { readonly kind: 'rows'; readonly rows: readonly PreviewRow[] } | { readonly kind: 'unreadable' };

/** Each plural category `locale` has, in banana-i18n's order, with the first number in it. */
export function pluralSamples(locale: string): PluralSample[] {
  const rules = new Intl.PluralRules(locale);
  const categories = rules.resolvedOptions().pluralCategories;
  return CATEGORY_ORDER.filter((category) => categories.includes(category)).flatMap((category) => {
    const count = SAMPLE_CANDIDATES.find((candidate) => rules.select(candidate) === category);
    return count === undefined ? [] : [{ category, count }];
  });
}

/** `{{PLURAL:$1|` or `{{GENDER:$1|`, and a gender without a parameter (`{{GENDER:|`). */
const CHOICE = /^\{\{\s*(plural|gender)\s*:\s*(?:\$([0-9]+))?\s*\|/i;

/** The message's text with its plurals and genders found: which parameters each depends on. */
interface Choices {
  /** The text, a gender without a parameter given one (`gender` holds it), so it can vary. */
  readonly text: string;
  readonly plural: ReadonlySet<number>;
  readonly gender: ReadonlySet<number>;
  /** How many parameters the text has, the given one included. */
  readonly parameters: number;
}

function findChoices(text: string, tokens: readonly PlaceholderTokenDto[]): Choices {
  const numbers = tokens
    .filter((token) => token.kind === 'parameter')
    .map((token) => Number(text.slice(token.start + 1, token.end)));
  const parameters = Math.max(0, ...numbers);
  const plural = new Set<number>();
  const gender = new Set<number>();
  // A gender without a parameter is the current user's: a parameter of its own, past the others.
  const unnamed = parameters + 1;
  const insertAt: number[] = [];
  for (const token of tokens) {
    if (token.kind !== 'plural' && token.kind !== 'gender') continue;
    const match = CHOICE.exec(text.slice(token.start, token.end));
    if (match === null) continue; // Its parameter isn't `$n` (another template): not varied.
    const into = token.kind === 'plural' ? plural : gender;
    if (match[2] !== undefined) into.add(Number(match[2]));
    else if (token.kind === 'gender') {
      gender.add(unnamed);
      insertAt.push(token.start + match[0].length - 1);
    }
  }
  let rewritten = text;
  for (const at of insertAt.sort((a, b) => b - a)) {
    rewritten = `${rewritten.slice(0, at)}$${String(unnamed)}${rewritten.slice(at)}`;
  }
  return {
    text: rewritten,
    plural,
    gender,
    parameters: Math.max(parameters, ...plural, ...gender),
  };
}

/** What banana-i18n's HTML reads as: tags and links as their text. Never put into the page. */
function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent;
}

const PREVIEW_KEY = 'paperl10n-preview';

/**
 * The translation `text` in `locale` for each plural form and gender, by the tokens main found in
 * it (`null`: it has neither, so there's nothing to preview). Plural rows take the "unknown"
 * gender, gender rows the "other" form's number; other parameters show as written (`$1`).
 */
export function messagePreview(
  locale: string,
  text: string,
  tokens: readonly PlaceholderTokenDto[],
): MessagePreview | null {
  const choices = findChoices(text, tokens);
  if (choices.plural.size === 0 && choices.gender.size === 0) return null;
  try {
    const banana = new Banana(locale, { wikilinks: true });
    banana.load({ [PREVIEW_KEY]: choices.text });
    const render = (count: number, gender: Gender) => {
      const values = Array.from({ length: choices.parameters }, (_, at): string | number => {
        if (choices.plural.has(at + 1)) return count;
        if (choices.gender.has(at + 1)) return gender;
        return `$${String(at + 1)}`;
      });
      return htmlToText(banana.i18n(PREVIEW_KEY, ...values));
    };
    const samples = pluralSamples(locale);
    const other = samples.find((sample) => sample.category === 'other')?.count ?? 2;
    const rows: PreviewRow[] = [];
    if (choices.plural.size > 0) {
      for (const { category, count } of samples) {
        rows.push({ kind: 'plural', category, count, text: render(count, 'unknown') });
      }
    }
    if (choices.gender.size > 0) {
      for (const gender of GENDERS) {
        rows.push({ kind: 'gender', gender, text: render(other, gender) });
      }
    }
    return { kind: 'rows', rows };
  } catch {
    // banana-i18n throws on syntax it can't parse (and Intl on a tag it can't read).
    return { kind: 'unreadable' };
  }
}
