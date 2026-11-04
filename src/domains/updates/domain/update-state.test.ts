// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  initialUpdateState,
  isCheckDue,
  parseUpdateState,
  serializeUpdateState,
  updateNotice,
  type UpdateState,
} from './update-state.ts';

const release = {
  version: '0.2.0',
  date: '2026-12-01',
  notes: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0',
  download: { en: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0' },
};
const saved: UpdateState = {
  checkedAt: 1000,
  latest: release,
  dismissed: '0.1.5',
  automatic: false,
};

describe('parseUpdateState', () => {
  it('reads what serializeUpdateState wrote', () => {
    expect(parseUpdateState(serializeUpdateState(saved))).toEqual(saved);
    expect(parseUpdateState(serializeUpdateState(initialUpdateState))).toEqual(initialUpdateState);
  });

  it.each<[string, string | null, UpdateState]>([
    ['nothing saved', null, initialUpdateState],
    ['not JSON', '{', initialUpdateState],
    ['a list', '[]', initialUpdateState],
    ['a number', '3', initialUpdateState],
    [
      'a broken release (the rest kept)',
      JSON.stringify({
        checkedAt: 5,
        latest: { version: '1' },
        dismissed: '0.2.0',
        automatic: false,
      }),
      { checkedAt: 5, latest: null, dismissed: '0.2.0', automatic: false },
    ],
    [
      'fields of the wrong type',
      JSON.stringify({ checkedAt: '5', dismissed: 3, automatic: 'no' }),
      initialUpdateState,
    ],
    [
      'a dismissed version that is not one',
      JSON.stringify({ dismissed: 'later' }),
      initialUpdateState,
    ],
  ])('%s', (_description, text, expected) => {
    expect(parseUpdateState(text)).toEqual(expected);
  });
});

describe('isCheckDue', () => {
  const day = CHECK_INTERVAL_MS;
  it.each<[string, number | null, number, boolean]>([
    ['never checked', null, 0, true],
    ['checked an hour ago', 10 * day, 10 * day + 3_600_000, false],
    ['checked just under a day ago', 10 * day, 11 * day - 1, false],
    ['checked a day ago', 10 * day, 11 * day, true],
    ['checked a week ago', 10 * day, 17 * day, true],
    ['the clock went backwards', 10 * day, 9 * day, true],
  ])('%s → %s', (_description, checkedAt, now, due) => {
    expect(isCheckDue(checkedAt, now)).toBe(due);
  });
});

describe('updateNotice', () => {
  const state = (overrides: Partial<UpdateState>): UpdateState => ({
    ...initialUpdateState,
    latest: release,
    ...overrides,
  });
  it.each<[string, UpdateState, string, boolean]>([
    ['a newer version', state({}), '0.1.0', true],
    ['the same version', state({}), '0.2.0', false],
    ['an older version', state({}), '0.3.0', false],
    ['nothing known', state({ latest: null }), '0.1.0', false],
    ['dismissed', state({ dismissed: '0.2.0' }), '0.1.0', false],
    ['an older version dismissed', state({ dismissed: '0.1.5' }), '0.1.0', true],
    ['checks turned off', state({ automatic: false }), '0.1.0', false],
  ])('%s → %s', (_description, given, current, shown) => {
    expect(updateNotice(given, current)).toEqual(shown ? release : null);
  });
});
