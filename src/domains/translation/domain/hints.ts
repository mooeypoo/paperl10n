// SPDX-License-Identifier: GPL-3.0-or-later
// Preservation hints (PRD §6, docs/plan/M3-sections.md question 6): neutral notes about things a
// translation usually keeps as is, when the source and the translation don't have the same ones.
// Never errors: whether a difference is right is the translator's call.

/** What's compared, in the order hints are listed. */
export const hintKinds = ['code-block', 'link', 'image', 'component', 'frontmatter-key'] as const;
export type HintKind = (typeof hintKinds)[number];

/** One thing a translation usually keeps: its kind, and the value compared (a target, a name). */
export interface Kept {
  readonly kind: HintKind;
  readonly value: string;
}

/** A kind of thing the source and the translation don't have the same of. */
export interface PreservationHint {
  readonly kind: HintKind;
  /** Values the source has more of than the translation, in the source's order. */
  readonly missing: readonly string[];
  /** Values the translation has more of than the source, in the translation's order. */
  readonly extra: readonly string[];
}

/** What `from` has that `other` doesn't, counting repeats, in `from`'s order. */
function without(from: readonly string[], other: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const value of other) left.set(value, (left.get(value) ?? 0) + 1);
  return from.filter((value) => {
    const count = left.get(value) ?? 0;
    if (count === 0) return true;
    left.set(value, count - 1);
    return false;
  });
}

/**
 * The hints for a source and its translation (a page, or a pair of sections): for each kind, the
 * values only one side has, compared as multisets (order doesn't matter, repeats do). Only kinds
 * with a difference are listed.
 */
export function preservationHints(
  source: readonly Kept[],
  translation: readonly Kept[],
): PreservationHint[] {
  return hintKinds.flatMap((kind): PreservationHint[] => {
    const inSource = source.filter((item) => item.kind === kind).map((item) => item.value);
    const inTranslation = translation
      .filter((item) => item.kind === kind)
      .map((item) => item.value);
    const missing = without(inSource, inTranslation);
    const extra = without(inTranslation, inSource);
    return missing.length === 0 && extra.length === 0 ? [] : [{ kind, missing, extra }];
  });
}
