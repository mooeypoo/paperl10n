// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  browserPreferences,
  memoryPreferences,
  recentLanguages,
  rememberRecentLanguage,
} from './preferences';

describe('browserPreferences', () => {
  it('keeps values in storage under a paperl10n. prefix', () => {
    localStorage.clear();
    const preferences = browserPreferences();
    preferences.set('theme', 'dark');
    expect(localStorage.getItem('paperl10n.theme')).toBe('dark');
    expect(preferences.get('theme')).toBe('dark');
    expect(preferences.get('missing')).toBeNull();
  });

  it('carries on when storage is unavailable', () => {
    const preferences = browserPreferences(() => {
      throw new Error('SecurityError: storage is blocked');
    });
    expect(() => {
      preferences.set('theme', 'dark');
    }).not.toThrow();
    expect(preferences.get('theme')).toBeNull();
  });
});

describe('memoryPreferences', () => {
  it('starts from the given values', () => {
    const preferences = memoryPreferences({ theme: 'light' });
    expect(preferences.get('theme')).toBe('light');
    preferences.set('theme', 'dark');
    expect(preferences.get('theme')).toBe('dark');
  });
});

describe('recent target languages', () => {
  it('keeps the newest first, each once (ignoring case), at most six', () => {
    const store = memoryPreferences();
    for (const tag of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'B']) rememberRecentLanguage(store, tag);
    expect(recentLanguages(store)).toEqual(['B', 'g', 'f', 'e', 'd', 'c']);
  });

  it.each([
    ['nothing stored', {}],
    ['not JSON', { 'recent-target-languages': '[' }],
    ['not a list', { 'recent-target-languages': '{"a":1}' }],
  ])('reads %s as no recent picks', (_description, stored) => {
    expect(recentLanguages(memoryPreferences(stored))).toEqual([]);
  });

  it('skips stored entries that are not language codes', () => {
    const store = memoryPreferences({ 'recent-target-languages': '["he", 3, "", null, "ar"]' });
    expect(recentLanguages(store)).toEqual(['he', 'ar']);
  });
});
