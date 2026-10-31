// SPDX-License-Identifier: GPL-3.0-or-later
// Finds what a banana-i18n message's translation must keep: parameters (`$1`), templates
// (`{{PLURAL:$1|…}}`, `{{GENDER:$1|…}}`, and others such as `{{SITENAME}}`), links (`[[Page|text]]`,
// `[https://… text]`), and HTML tags. Templates and links are matched with their own closing
// brackets and scanned inside, so tokens always nest and never partly overlap. Syntax that isn't
// closed yields no token.
import type { PlaceholderToken } from '#plugin-api';

const PARAMETER = /\$[0-9]+/y;
const EXTERNAL_LINK = /\[((?:https?:)?\/\/[^\s\]]+)/y;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s[^<>]*)?\/?>/y;
const PLURAL_OR_GENDER = /^\s*(plural|gender)\s*:/i;

/** Where the pair of `open` (`{{`, `[[`) starting at `from` closes, before `end`; -1 if it doesn't. */
function closingOf(text: string, from: number, end: number, open: string, close: string): number {
  let depth = 0;
  let at = from;
  while (at + 1 < end) {
    if (text.startsWith(open, at)) {
      depth++;
      at += 2;
    } else if (text.startsWith(close, at)) {
      depth--;
      if (depth === 0) return at;
      at += 2;
    } else {
      at++;
    }
  }
  return -1;
}

/** The text before the first `|` that isn't inside a nested template or link. */
function beforePipe(inner: string): string {
  let depth = 0;
  for (let at = 0; at < inner.length; at++) {
    const pair = inner.slice(at, at + 2);
    if (pair === '{{' || pair === '[[') {
      depth++;
      at++;
    } else if ((pair === '}}' || pair === ']]') && depth > 0) {
      depth--;
      at++;
    } else if (inner[at] === '|' && depth === 0) {
      return inner.slice(0, at);
    }
  }
  return inner;
}

function scanRange(text: string, start: number, end: number, tokens: PlaceholderToken[]): void {
  let at = start;
  while (at < end) {
    const span = (tokenEnd: number) => ({
      text: text.slice(at, tokenEnd),
      start: at,
      end: tokenEnd,
    });

    // Digits never run past a range's end, which is always a `}}`, `]]`, `]`, or the text's end.
    PARAMETER.lastIndex = at;
    if (PARAMETER.test(text)) {
      tokens.push({ kind: 'parameter', ...span(PARAMETER.lastIndex) });
      at = PARAMETER.lastIndex;
      continue;
    }

    if (text.startsWith('{{', at)) {
      const close = closingOf(text, at, end, '{{', '}}');
      if (close >= 0) {
        const inner = text.slice(at + 2, close);
        const kind = PLURAL_OR_GENDER.exec(inner);
        if (kind === null) {
          tokens.push({ kind: 'other', ...span(close + 2) });
        } else {
          const parameter = beforePipe(inner.slice(kind[0].length)).trim();
          const name = kind[1]?.toLowerCase() === 'plural' ? 'plural' : 'gender';
          tokens.push({ kind: name, parameter, ...span(close + 2) });
        }
        scanRange(text, at + 2, close, tokens);
        at = close + 2;
        continue;
      }
    }

    if (text.startsWith('[[', at)) {
      const close = closingOf(text, at, end, '[[', ']]');
      const target = close < 0 ? '' : beforePipe(text.slice(at + 2, close)).trim();
      if (target !== '') {
        tokens.push({ kind: 'link', target, ...span(close + 2) });
        scanRange(text, at + 2, close, tokens);
        at = close + 2;
        continue;
      }
    }

    EXTERNAL_LINK.lastIndex = at;
    const external = EXTERNAL_LINK.exec(text);
    if (external !== null) {
      const close = text.indexOf(']', EXTERNAL_LINK.lastIndex);
      if (close >= 0 && close < end) {
        tokens.push({ kind: 'link', target: external[1] ?? '', ...span(close + 1) });
        scanRange(text, EXTERNAL_LINK.lastIndex, close, tokens);
        at = close + 1;
        continue;
      }
    }

    TAG.lastIndex = at;
    const tag = TAG.exec(text);
    if (tag !== null && TAG.lastIndex <= end) {
      tokens.push({ kind: 'tag', name: (tag[1] ?? '').toLowerCase(), ...span(TAG.lastIndex) });
      at = TAG.lastIndex;
      continue;
    }

    at++;
  }
}

/** The message's tokens, by start, an enclosing token before the ones inside it. */
export function scanBanana(text: string): readonly PlaceholderToken[] {
  const tokens: PlaceholderToken[] = [];
  scanRange(text, 0, text.length, tokens);
  return tokens;
}
