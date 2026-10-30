// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { hintMessages } from './hint-message';
import { createI18n } from './i18n';

const english = createI18n('en');
const t = (key: string, ...params: (string | number)[]) => english.t(key, ...params);
const isolated = (text: string) => `⁨${text}⁩`;

describe('hintMessages', () => {
  it('says what only the source has, then what only the translation has', () => {
    expect(hintMessages({ kind: 'link', missing: ['/a/', '/b/'], extra: ['/z/'] }, t)).toEqual([
      `2 links only in the source: ${isolated('/a/')}, ${isolated('/b/')}`,
      `A link only here: ${isolated('/z/')}`,
    ]);
  });

  it('names a code block without a language', () => {
    expect(hintMessages({ kind: 'code-block', missing: ['', 'ts'], extra: [] }, t)).toEqual([
      `2 code blocks only in the source: no language, ${isolated('ts')}`,
    ]);
  });

  it.each([
    ['image', 'An image only here: '],
    ['component', 'A component or HTML tag only here: '],
    ['frontmatter-key', 'A frontmatter key only here: '],
  ] as const)('has a message for %s', (kind, start) => {
    expect(hintMessages({ kind, missing: [], extra: ['x'] }, t)).toEqual([
      `${start}${isolated('x')}`,
    ]);
  });

  it('is in Hebrew too', () => {
    const hebrew = createI18n('he');
    const inHebrew = (key: string, ...params: (string | number)[]) => hebrew.t(key, ...params);
    expect(hintMessages({ kind: 'link', missing: ['/a/'], extra: [] }, inHebrew)).toEqual([
      `קישור אחד רק במקור: ${isolated('/a/')}`,
    ]);
  });
});
