// SPDX-License-Identifier: GPL-3.0-or-later
// Checking a translation against its source as it's written (docs/plan/M3-sections.md, questions 6
// and 7): the preservation hints, per paired section and for the page, and the length of each as
// rendered. Information only, never a status.
import type { InlineSpan, ParsedDocument, PreservedElement } from '#domains/document';
import type { TextRange } from '#kernel/text-range';
import { preservationHints, type Kept, type PreservationHint } from '../domain/hints.ts';
import { pairDocumentSections } from './document-sections.ts';

export interface TranslationCheck {
  /** The whole page's hints. */
  readonly page: readonly PreservationHint[];
  /**
   * Each section pair's hints, by pair index, when the sections pair (`null`: they don't). A pair
   * with only one side has none: the pairing already says it's missing.
   */
  readonly sections: readonly (readonly PreservationHint[])[] | null;
  /** How long each is as rendered, in characters (see `renderedLength`). */
  readonly length: { readonly source: number; readonly translation: number };
}

type Document = Pick<ParsedDocument, 'blocks' | 'inline' | 'preserved' | 'text'>;

/** Blocks that don't render as text: the frontmatter, code, HTML, MDX lines, definitions, fences. */
const unrendered = new Set<string>([
  'frontmatter',
  'code',
  'html',
  'mdx-esm',
  'link-definition',
  'container-fence',
]);
/** Inline spans that don't render as text: syntax and link destinations (inline code does). */
const unrenderedInline = new Set<InlineSpan['kind']>(['markup', 'url']);

/**
 * A document's length as rendered: its characters other than whitespace, without Markdown syntax,
 * link destinations, code blocks, HTML, and frontmatter. Characters, not words: word counts mean
 * little across scripts.
 */
export function renderedLength(document: Document): number {
  const skipped: TextRange[] = document.inline
    .filter((span) => unrenderedInline.has(span.kind))
    .map((span) => span.range);
  let length = 0;
  for (const block of document.blocks) {
    if (unrendered.has(block.kind)) continue;
    let at = block.range.start;
    const count = (end: number) => {
      for (const character of document.text.slice(at, end)) {
        if (character.trim() !== '') length++;
      }
    };
    for (const range of skipped) {
      if (range.end <= at || range.start >= block.range.end) continue;
      count(range.start);
      at = range.end;
    }
    count(block.range.end);
  }
  return length;
}

const keptIn = (
  preserved: readonly PreservedElement[],
  range: TextRange | null,
  linkTarget: (target: string) => string,
): Kept[] =>
  preserved
    .filter(
      (element) =>
        range === null || (range.start <= element.range.start && element.range.start < range.end),
    )
    .map((element) => ({
      kind: element.kind,
      value: element.kind === 'link' ? linkTarget(element.value) : element.value,
    }));

/**
 * Checks a translation (as it's written now) against its source. `sourceLinkTarget` reads a
 * translation's link target in the source's form (the format plugin's mapping), so a localized
 * link isn't flagged.
 */
export function checkTranslation(
  source: Document,
  translation: Document,
  sourceLinkTarget: (target: string) => string,
): TranslationCheck {
  const asWritten = (target: string) => target;
  const hintsFor = (sourceRange: TextRange | null, translationRange: TextRange | null) =>
    preservationHints(
      keptIn(source.preserved, sourceRange, asWritten),
      keptIn(translation.preserved, translationRange, sourceLinkTarget),
    );
  const pairing = pairDocumentSections(source, translation);
  return {
    page: hintsFor(null, null),
    sections: pairing.paired
      ? pairing.pairs.map((pair) =>
          pair.source === null || pair.target === null
            ? []
            : hintsFor(pair.source.range, pair.target.range),
        )
      : null,
    length: { source: renderedLength(source), translation: renderedLength(translation) },
  };
}
