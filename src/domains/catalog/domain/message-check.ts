// SPDX-License-Identifier: GPL-3.0-or-later
// Checking a translation against its source message (docs/plan/M4-catalogs.md, question 5).
// Warnings only: a translator may be right to differ (a Hebrew plural form can drop `$1`), so
// nothing here blocks a save. The plugin's scanner finds the tokens; this compares them, so it
// works the same for every catalog format.
import { comparedValue, type PlaceholderKind, type PlaceholderToken } from './placeholder.ts';

/** A message's text and the tokens its catalog's plugin found in it. */
export interface ScannedText {
  readonly text: string;
  readonly tokens: readonly PlaceholderToken[];
}

export type MessageWarning =
  /** The source has it, the translation doesn't. */
  | { readonly kind: 'missing'; readonly token: PlaceholderKind; readonly value: string }
  /** The translation has it, the source doesn't. */
  | { readonly kind: 'unexpected'; readonly token: PlaceholderKind; readonly value: string }
  /** The translation's brackets don't balance the way the source's do: it would render broken. */
  | { readonly kind: 'unbalanced'; readonly brackets: Brackets };

export type Brackets = '{}' | '[]';

/**
 * Kinds a translation may add without a warning: a language can need a plural or a gender the
 * source doesn't (English "$1 items" may need `{{PLURAL:$1|…}}` in Hebrew).
 */
const MAY_ADD: ReadonlySet<PlaceholderKind> = new Set(['plural', 'gender']);

const BRACKETS: readonly Brackets[] = ['{}', '[]'];

/** `kind` and compared value, as one key. */
const keyOf = (token: PlaceholderToken) => `${token.kind}\u0000${comparedValue(token)}`;

/** Each distinct token, by kind and compared value, in order of first appearance (a map keeps
 * a key where it was first set). */
function distinct(tokens: readonly PlaceholderToken[]): Map<string, PlaceholderToken> {
  return new Map(tokens.map((token) => [keyOf(token), token]));
}

/** How many more opening than closing brackets of a pair the text has. */
function imbalance(text: string, [open, close]: string): number {
  let balance = 0;
  for (const char of text) {
    if (char === open) balance++;
    else if (char === close) balance--;
  }
  return balance;
}

/**
 * What a translation lost or gained against its source, compared as sets by kind: each token's
 * compared value (a parameter's text, a plural's parameter, a link's target, a tag's name). A
 * token used twice in one and once in the other isn't a difference. An empty translation has
 * nothing to check.
 */
export function checkMessage(source: ScannedText, translation: ScannedText): MessageWarning[] {
  if (translation.text === '') return [];
  const inSource = distinct(source.tokens);
  const inTranslation = distinct(translation.tokens);
  const warnings: MessageWarning[] = [];
  for (const [key, token] of inSource) {
    if (!inTranslation.has(key)) {
      warnings.push({ kind: 'missing', token: token.kind, value: comparedValue(token) });
    }
  }
  for (const [key, token] of inTranslation) {
    if (!inSource.has(key) && !MAY_ADD.has(token.kind)) {
      warnings.push({ kind: 'unexpected', token: token.kind, value: comparedValue(token) });
    }
  }
  for (const brackets of BRACKETS) {
    if (imbalance(translation.text, brackets) !== imbalance(source.text, brackets)) {
      warnings.push({ kind: 'unbalanced', brackets });
    }
  }
  return warnings;
}
