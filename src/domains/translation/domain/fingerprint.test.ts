// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { blockFingerprint, normalizedBlockText } from './fingerprint.ts';

describe('normalizedBlockText', () => {
  it.each([
    ['LF stays', 'a\nb', 'a\nb'],
    ['CRLF reads as LF', 'a\r\nb', 'a\nb'],
    ['CR reads as LF', 'a\rb', 'a\nb'],
    ['whitespace at line ends goes', 'a  \t\nb ', 'a\nb'],
    ['indentation stays', '  a\n\tb', '  a\n\tb'],
    ['inner spaces stay', 'a  b', 'a  b'],
    ['blank lines stay', 'a\n\nb', 'a\n\nb'],
  ])('%s', (_description, text, expected) => {
    expect(normalizedBlockText(text)).toBe(expected);
  });
});

describe('blockFingerprint', () => {
  // Stored in committed status files: these must never change (that would be a new version).
  it.each([
    ['', '488bdcb81aee8d83'],
    ['## Install', '9969cc97933612c8'],
    ['שלום עולם', 'b8f6e7bbb77a95be'],
    ['a\nb', 'edbde594bc8e1ca1'],
  ])('fingerprints %j as before', (text, expected) => {
    expect(blockFingerprint(text)).toBe(expected);
  });

  it('ignores line endings and trailing whitespace', () => {
    expect(blockFingerprint('a \r\nb\t')).toBe(blockFingerprint('a\nb'));
  });

  it.each([
    ['a typo fix', 'Teh text', 'The text'],
    ['indentation', '- a\n  - b', '- a\n- b'],
    ['a joined line', 'a\nb', 'a b'],
    ['case', 'Install', 'install'],
  ])('tells %s apart', (_description, a, b) => {
    expect(blockFingerprint(a)).not.toBe(blockFingerprint(b));
  });

  it('is 16 lowercase hex digits', () => {
    expect(blockFingerprint('x'.repeat(10_000))).toMatch(/^[0-9a-f]{16}$/);
  });
});
