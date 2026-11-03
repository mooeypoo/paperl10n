// SPDX-License-Identifier: GPL-3.0-or-later
// What a gettext message's translation must keep, by the entry's flags (GNU gettext manual,
// "Special Comments preceding Keywords"): `c-format` (and `objc-format`, `php-format`) marks
// printf directives (`%s`, `%1$d`, `%.2f`); `python-format` marks `%(name)s` and `%s`;
// `python-brace-format` marks `{name}`, `{0}`, `{0:>10}`. Without a flag, `%` and `{` are plain
// text ("100%", JSON in a message), and only HTML tags are found. `%%` and `{{` are escapes, not
// directives. Tokens come in order, nested or apart: one that would partly overlap another is
// dropped.
import type { PlaceholderToken } from '#plugin-api';

const PRINTF =
  /%(?:\d+\$)?[-+ #0']*(?:\d+|\*(?:\d+\$)?)?(?:\.(?:\d+|\*(?:\d+\$)?))?(?:hh|h|ll|l|L|q|j|z|Z|t)?[diouxXeEfFgGaAcspn]|%%/g;
const PYTHON = /%(?:\([^)]*\))?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[diouxXeEfFgGcrsa]|%%/g;
const BRACE = /\{\{|\}\}|\{[^{}\s]*\}/g;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s[^<>]*)?\/?>/g;

const PRINTF_FLAGS = ['c-format', 'objc-format', 'php-format'];

/** The directives of `pattern` in `text`, leaving out its escapes (`%%`, `{{`, `}}`). */
function directives(text: string, pattern: RegExp, escapes: readonly string[]): PlaceholderToken[] {
  return [...text.matchAll(pattern)].flatMap((match): PlaceholderToken[] => {
    const [found = ''] = match;
    if (escapes.includes(found)) return [];
    const start = match.index;
    return [{ kind: 'parameter', text: found, start, end: start + found.length }];
  });
}

/** The tokens of `text`, a text of a message with these `flags`. */
export function scanGettext(text: string, flags: readonly string[]): PlaceholderToken[] {
  const found: PlaceholderToken[] = [
    ...[...text.matchAll(TAG)].map((match): PlaceholderToken => {
      const [whole = '', name = ''] = match;
      const start = match.index;
      return {
        kind: 'tag',
        name: name.toLowerCase(),
        text: whole,
        start,
        end: start + whole.length,
      };
    }),
  ];
  if (flags.some((flag) => PRINTF_FLAGS.includes(flag)))
    found.push(...directives(text, PRINTF, ['%%']));
  if (flags.includes('python-format')) found.push(...directives(text, PYTHON, ['%%']));
  if (flags.includes('python-brace-format')) found.push(...directives(text, BRACE, ['{{', '}}']));

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PlaceholderToken[] = [];
  for (const token of found) {
    const clashes = kept.some(
      (other) =>
        (other.start === token.start && other.end === token.end) ||
        (token.start < other.end &&
          other.start < token.end &&
          !(other.start <= token.start && token.end <= other.end)),
    );
    if (!clashes) kept.push(token);
  }
  return kept;
}
