// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { pairCatalog } from './catalog-messages.ts';
import { messageKey, type Message } from './message.ts';

function messages(entries: Record<string, string>): Message[] {
  return Object.entries(entries).map(([raw, text]) => {
    const key = messageKey(raw);
    if (!key.ok) throw new Error(`test setup: ${raw}`);
    return { key: key.value, text };
  });
}

const source = messages({ a: 'A', b: 'B', c: 'C' });

/** A paired message with nothing kept apart: no forms, no review mark. */
const paired = (
  key: string,
  sourceText: string,
  documentation: string | null,
  translation: string | null,
) => ({
  key,
  source: sourceText,
  sourceForms: null,
  documentation,
  translation,
  translationForms: null,
  needsReview: false,
  previousSource: null,
});

function message(raw: string, text: string, fields: Partial<Message> = {}): Message {
  const key = messageKey(raw);
  if (!key.ok) throw new Error(`test setup: ${raw}`);
  return { key: key.value, text, ...fields };
}

describe('pairCatalog', () => {
  it('pairs each source message with its documentation and translation, in source order', () => {
    const result = pairCatalog(
      source,
      messages({ c: 'ג', a: 'א' }),
      messages({ b: 'About B', a: 'About A' }),
    );
    expect(result).toEqual({
      messages: [
        paired('a', 'A', 'About A', 'א'),
        paired('b', 'B', 'About B', null),
        paired('c', 'C', null, 'ג'),
      ],
      notInSource: [],
    });
  });

  it('reads an empty translation or documentation as none', () => {
    const result = pairCatalog(messages({ a: 'A' }), messages({ a: '' }), messages({ a: '' }));
    expect(result.messages).toEqual([paired('a', 'A', null, null)]);
  });

  it('lists the translation’s messages the source lacks, in the translation’s order', () => {
    const result = pairCatalog(source, messages({ z: 'Z', a: 'א', y: 'Y' }), null);
    expect(result.notInSource).toEqual(messages({ z: 'Z', y: 'Y' }));
  });

  it('ignores documentation for keys the source lacks', () => {
    const result = pairCatalog(messages({ a: 'A' }), null, messages({ gone: 'Old docs' }));
    expect(result).toEqual({
      messages: [paired('a', 'A', null, null)],
      notInSource: [],
    });
  });

  it('pairs a catalog without a target or documentation file', () => {
    expect(pairCatalog(source, null, null).messages.map((m) => m.translation)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('takes a message’s own documentation when no documentation file says something', () => {
    const result = pairCatalog(
      [
        message('a', 'A', { documentation: 'Own A' }),
        message('b', 'B', { documentation: 'Own B' }),
        message('c', 'C', { documentation: '' }),
      ],
      null,
      messages({ a: 'From the file', b: '' }),
    );
    expect(result.messages.map((m) => m.documentation)).toEqual(['From the file', 'Own B', null]);
  });

  it('pairs plural forms, and a translation with every form empty as none', () => {
    const forms = ['%d lamp', '%d lamps'];
    const result = pairCatalog(
      [message('n', '%d lamp', { forms }), message('m', 'x', { forms: ['x', 'xs'] })],
      [
        message('n', 'מנורה', { forms: ['מנורה', 'שתיים', '%d'] }),
        message('m', '', { forms: ['', ''] }),
      ],
      null,
    );
    expect(result.messages).toEqual([
      {
        ...paired('n', '%d lamp', null, 'מנורה'),
        sourceForms: forms,
        translationForms: ['מנורה', 'שתיים', '%d'],
      },
      { ...paired('m', 'x', null, null), sourceForms: ['x', 'xs'] },
    ]);
    // A later form filled in: a translation, its first form empty.
    const partial = pairCatalog(
      [message('n', '%d lamp', { forms })],
      [message('n', '', { forms: ['', '%d'] })],
      null,
    );
    expect(partial.messages[0]).toMatchObject({ translation: '', translationForms: ['', '%d'] });
  });

  it('pairs a translation’s review mark, and the source it was made for only with one', () => {
    const result = pairCatalog(
      messages({ a: 'A', b: 'B', c: 'C' }),
      [
        message('a', 'א', { needsReview: true, previousSource: 'Old A' }),
        message('b', 'ב', { needsReview: true }),
        message('c', 'ג', { needsReview: false, previousSource: 'Stale' }),
      ],
      null,
    );
    expect(result.messages.map((m) => [m.needsReview, m.previousSource])).toEqual([
      [true, 'Old A'],
      [true, null],
      [false, null],
    ]);
  });

  it('pairs an empty source', () => {
    expect(pairCatalog([], messages({ a: 'א' }), null)).toEqual({
      messages: [],
      notInSource: messages({ a: 'א' }),
    });
  });
});
