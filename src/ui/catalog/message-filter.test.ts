// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CatalogMessageDto, MessageStatusDto } from '#ipc-contract';
import { filterMessages, type StatusFilter } from './message-filter';

const message = (
  key: string,
  source: string,
  translation: string | null,
  status: MessageStatusDto,
): CatalogMessageDto => ({
  key,
  source,
  documentation: null,
  translation,
  status,
  sourceTokens: [],
  translationTokens: [],
});

const messages = [
  message('app-open', 'Open folder', 'פתיחת תיקייה', 'translated'),
  message('app-save', 'Save', null, 'missing'),
  message('app-close', 'Close the window', 'סגירה', 'outdated'),
  message('app-help', 'Help', 'עזרה', 'draft'),
];
const keys = (found: CatalogMessageDto[]) => found.map((m) => m.key);

describe('filterMessages', () => {
  it.each<[StatusFilter, string[]]>([
    ['all', ['app-open', 'app-save', 'app-close', 'app-help']],
    ['needs-work', ['app-save', 'app-close']],
    ['missing', ['app-save']],
    ['outdated', ['app-close']],
    ['draft', ['app-help']],
    ['translated', ['app-open']],
  ])('shows the "%s" messages, in source order', (status, expected) => {
    expect(keys(filterMessages(messages, '', status))).toEqual(expected);
  });

  it.each([
    ['a key', 'save', ['app-save']],
    ['source text, ignoring case', 'WINDOW', ['app-close']],
    ['a translation', 'תיקייה', ['app-open']],
    ['every word, anywhere', 'app folder', ['app-open']],
    ['nothing', 'zebra', []],
    ['only spaces (everything)', '   ', ['app-open', 'app-save', 'app-close', 'app-help']],
  ])('searches %s', (_name, query, expected) => {
    expect(keys(filterMessages(messages, query, 'all'))).toEqual(expected);
  });

  it('applies the search and the status together', () => {
    expect(keys(filterMessages(messages, 'app', 'needs-work'))).toEqual(['app-save', 'app-close']);
    expect(keys(filterMessages(messages, 'help', 'needs-work'))).toEqual([]);
  });
});
