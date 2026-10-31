// SPDX-License-Identifier: GPL-3.0-or-later
// Placeholder tokens: the pieces of a message its translation must keep. A catalog plugin finds
// them (`CatalogFormat.placeholders.scan`, in `formats`); this domain compares them, so it never
// reads a system's syntax itself.
export type PlaceholderKind = PlaceholderToken['kind'];

/**
 * A piece of a message the translation must keep. Each kind carries what a check compares between
 * a source message and its translation. Tokens may nest (a parameter inside a plural), but never
 * partly overlap.
 */
export type PlaceholderToken = PlaceholderSpan &
  (ParameterToken | PluralToken | GenderToken | LinkToken | TagToken | OtherToken);

interface PlaceholderSpan {
  readonly text: string;
  /** UTF-16 offsets into the scanned text. */
  readonly start: number;
  readonly end: number;
}

/** `$1`, `%s`, `%1$s`, `{name}`: compared by its text. */
interface ParameterToken {
  readonly kind: 'parameter';
}

/** `{{PLURAL:$1|…}}`: compared by the parameter it depends on, as written (`$1`). */
interface PluralToken {
  readonly kind: 'plural';
  readonly parameter: string;
}

/** `{{GENDER:$1|…}}`: compared by its parameter, as written (empty when it has none). */
interface GenderToken {
  readonly kind: 'gender';
  readonly parameter: string;
}

/** `[[Page|text]]`, `[https://… text]`: compared by its target, as written. */
interface LinkToken {
  readonly kind: 'link';
  readonly target: string;
}

/** `<b>`, `</b>`: compared by its name, lowercased. */
interface TagToken {
  readonly kind: 'tag';
  readonly name: string;
}

/** Anything else kept as is (`{{SITENAME}}`, `{{int:…}}`): compared by its text. */
interface OtherToken {
  readonly kind: 'other';
}

/** What a check compares a token by: a parameter's text, a plural's or gender's parameter, a
 * link's target, a tag's name, or anything else's text. */
export function comparedValue(token: PlaceholderToken): string {
  switch (token.kind) {
    case 'plural':
    case 'gender':
      return token.parameter;
    case 'link':
      return token.target;
    case 'tag':
      return token.name;
    case 'parameter':
    case 'other':
      return token.text;
  }
}
