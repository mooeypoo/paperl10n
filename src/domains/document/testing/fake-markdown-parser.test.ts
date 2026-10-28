// SPDX-License-Identifier: GPL-3.0-or-later
// The fake must satisfy the same invariants as a real parser, so use-case tests stay honest.
import { describe, expect, it } from 'vitest';
import { parsedDocumentProblems } from '../domain/parsed-document.ts';
import { FakeMarkdownParser } from './fake-markdown-parser.ts';
import { tricky } from './markdown-parser-contract.ts';

describe('FakeMarkdownParser', () => {
  it.each(Object.entries(tricky))('produces a valid document for %s', (_label, text) => {
    expect(parsedDocumentProblems(new FakeMarkdownParser().parse(text, { mdx: false }))).toEqual(
      [],
    );
  });

  it('records what it parsed', () => {
    const parser = new FakeMarkdownParser();
    parser.parse('# x', { mdx: true });
    expect(parser.calls).toEqual([{ text: '# x', options: { mdx: true } }]);
  });
});
