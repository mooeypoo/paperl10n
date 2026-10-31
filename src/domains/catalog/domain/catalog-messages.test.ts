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

describe('pairCatalog', () => {
  it('pairs each source message with its documentation and translation, in source order', () => {
    const paired = pairCatalog(
      source,
      messages({ c: 'ג', a: 'א' }),
      messages({ b: 'About B', a: 'About A' }),
    );
    expect(paired).toEqual({
      messages: [
        { key: 'a', source: 'A', documentation: 'About A', translation: 'א' },
        { key: 'b', source: 'B', documentation: 'About B', translation: null },
        { key: 'c', source: 'C', documentation: null, translation: 'ג' },
      ],
      notInSource: [],
    });
  });

  it('reads an empty translation or documentation as none', () => {
    const paired = pairCatalog(messages({ a: 'A' }), messages({ a: '' }), messages({ a: '' }));
    expect(paired.messages).toEqual([
      { key: 'a', source: 'A', documentation: null, translation: null },
    ]);
  });

  it('lists the translation’s messages the source lacks, in the translation’s order', () => {
    const paired = pairCatalog(source, messages({ z: 'Z', a: 'א', y: 'Y' }), null);
    expect(paired.notInSource).toEqual(messages({ z: 'Z', y: 'Y' }));
  });

  it('ignores documentation for keys the source lacks', () => {
    const paired = pairCatalog(messages({ a: 'A' }), null, messages({ gone: 'Old docs' }));
    expect(paired).toEqual({
      messages: [{ key: 'a', source: 'A', documentation: null, translation: null }],
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

  it('pairs an empty source', () => {
    expect(pairCatalog([], messages({ a: 'א' }), null)).toEqual({
      messages: [],
      notInSource: messages({ a: 'א' }),
    });
  });
});
