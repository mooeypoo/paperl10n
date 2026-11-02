// SPDX-License-Identifier: GPL-3.0-or-later
import type { PlaceholderTokenDto } from '#ipc-contract';

/** A run of a message's text: plain text, or one token the translation must keep. */
export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'token'; readonly text: string; readonly token: PlaceholderTokenDto['kind'] };

/**
 * Splits a message at its top-level tokens (a token inside another is part of it), so each token
 * can be shown isolated: `$1` or `{{PLURAL:…}}` in a Hebrew sentence keeps its place instead of
 * reordering the text around it. Tokens come from main in order (by start, the enclosing first).
 */
export function tokenSegments(text: string, tokens: readonly PlaceholderTokenDto[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let at = 0;
  for (const token of tokens) {
    // Inside the previous top-level token, or outside the text: not a segment of its own.
    if (token.start < at || token.end > text.length || token.start >= token.end) continue;
    if (token.start > at) segments.push({ kind: 'text', text: text.slice(at, token.start) });
    segments.push({ kind: 'token', text: text.slice(token.start, token.end), token: token.kind });
    at = token.end;
  }
  if (at < text.length) segments.push({ kind: 'text', text: text.slice(at) });
  return segments;
}
