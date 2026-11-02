// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { PlaceholderTokenDto } from '#ipc-contract';
import { tokenSegments } from './token-segments';

const token = (kind: PlaceholderTokenDto['kind'], start: number, end: number) => ({
  kind,
  start,
  end,
});

describe('tokenSegments', () => {
  it('returns plain text as one segment, and nothing for an empty text', () => {
    expect(tokenSegments('Hello', [])).toEqual([{ kind: 'text', text: 'Hello' }]);
    expect(tokenSegments('', [])).toEqual([]);
  });

  it('splits text at tokens, keeping the text between them', () => {
    expect(
      tokenSegments('שלום $1, יש $2', [token('parameter', 5, 7), token('parameter', 12, 14)]),
    ).toEqual([
      { kind: 'text', text: 'שלום ' },
      { kind: 'token', text: '$1', token: 'parameter' },
      { kind: 'text', text: ', יש ' },
      { kind: 'token', text: '$2', token: 'parameter' },
    ]);
  });

  it('keeps a nested token inside the token that encloses it', () => {
    const text = 'יש {{PLURAL:$1|פריט|$1 פריטים}}.';
    expect(
      tokenSegments(text, [
        token('plural', 3, 31),
        token('parameter', 12, 14),
        token('parameter', 20, 22),
      ]),
    ).toEqual([
      { kind: 'text', text: 'יש ' },
      { kind: 'token', text: '{{PLURAL:$1|פריט|$1 פריטים}}', token: 'plural' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('handles a token at either end of the text', () => {
    expect(tokenSegments('$1 x $2', [token('parameter', 0, 2), token('parameter', 5, 7)])).toEqual([
      { kind: 'token', text: '$1', token: 'parameter' },
      { kind: 'text', text: ' x ' },
      { kind: 'token', text: '$2', token: 'parameter' },
    ]);
  });

  it('ignores tokens outside the text or empty, keeping the text whole', () => {
    expect(tokenSegments('abc', [token('other', 1, 1), token('other', 2, 9)])).toEqual([
      { kind: 'text', text: 'abc' },
    ]);
  });
});
