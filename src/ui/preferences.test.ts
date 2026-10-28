// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { browserPreferences, memoryPreferences } from './preferences';

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
