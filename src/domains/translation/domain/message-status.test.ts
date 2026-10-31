// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { blockFingerprint } from './fingerprint.ts';
import {
  messageFingerprint,
  messageStatus,
  recordMessages,
  type MessageStatus,
} from './message-status.ts';

const recorded = messageFingerprint('Hello $1');

describe('messageStatus', () => {
  it.each<[string, string | null, string | undefined, MessageStatus]>([
    ['no translation', null, recorded, 'missing'],
    ['an empty translation', '', recorded, 'missing'],
    ['a missing one never recorded', null, undefined, 'missing'],
    ['a translation never recorded', 'שלום $1', undefined, 'draft'],
    ['a recorded translation, source unchanged', 'שלום $1', recorded, 'translated'],
    ['a recorded translation, source changed', 'שלום $1', messageFingerprint('Hi $1'), 'outdated'],
  ])('%s', (_name, translation, record, expected) => {
    expect(messageStatus('Hello $1', translation, record)).toBe(expected);
  });

  it('ignores line endings and trailing spaces in the source, like block fingerprints', () => {
    expect(messageFingerprint('a  \r\nb')).toBe(messageFingerprint('a\nb'));
    expect(messageFingerprint('a\nb')).toBe(blockFingerprint('a\nb'));
    expect(messageStatus('a  \r\nb', 'x', messageFingerprint('a\nb'))).toBe('translated');
  });
});

describe('recordMessages', () => {
  it('records saved translations against their source as it is now', () => {
    const record = recordMessages(undefined, [
      { key: 'a', source: 'A', translation: 'א' },
      { key: 'b', source: 'B', translation: 'ב' },
    ]);
    expect(record).toEqual(
      new Map([
        ['a', messageFingerprint('A')],
        ['b', messageFingerprint('B')],
      ]),
    );
  });

  it('re-records an outdated message, and keeps the others as they were', () => {
    const before = new Map([
      ['a', messageFingerprint('Old A')],
      ['b', messageFingerprint('Old B')],
    ]);
    const after = recordMessages(before, [{ key: 'a', source: 'A', translation: 'א' }]);
    expect(after).toEqual(
      new Map([
        ['a', messageFingerprint('A')],
        ['b', messageFingerprint('Old B')],
      ]),
    );
    expect(before.get('a')).toBe(messageFingerprint('Old A'));
  });

  it('drops the record of a translation removed or emptied', () => {
    const before = new Map([
      ['a', messageFingerprint('A')],
      ['b', messageFingerprint('B')],
    ]);
    const after = recordMessages(before, [
      { key: 'a', source: 'A', translation: null },
      { key: 'b', source: 'B', translation: '' },
      { key: 'c', source: 'C', translation: null },
    ]);
    expect(after).toEqual(new Map());
  });
});
