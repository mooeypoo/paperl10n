// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { comparedValue, type PlaceholderToken } from './placeholder.ts';

const span = { text: 'T', start: 0, end: 1 };

describe('comparedValue', () => {
  it.each<[PlaceholderToken, string]>([
    [{ kind: 'parameter', ...span, text: '$1' }, '$1'],
    [{ kind: 'plural', parameter: '$2', ...span }, '$2'],
    [{ kind: 'gender', parameter: '', ...span }, ''],
    [{ kind: 'link', target: 'Help', ...span }, 'Help'],
    [{ kind: 'tag', name: 'b', ...span }, 'b'],
    [{ kind: 'other', ...span, text: '{{SITENAME}}' }, '{{SITENAME}}'],
  ])('compares %o by %s', (token, expected) => {
    expect(comparedValue(token)).toBe(expected);
  });
});
