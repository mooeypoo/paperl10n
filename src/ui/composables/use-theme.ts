// SPDX-License-Identifier: GPL-3.0-or-later
import { inject, ref, watchEffect, type InjectionKey, type Ref } from 'vue';
import type { PreferenceStore } from '../preferences';

/** "system" follows the OS (prefers-color-scheme); the others override it. */
export const themeChoices = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof themeChoices)[number];

function isThemeChoice(value: string | null): value is ThemeChoice {
  return themeChoices.some((choice) => choice === value);
}

export interface Theme {
  readonly choice: Ref<ThemeChoice>;
}

/**
 * The theme choice, saved in `preferences`, applied as `<html data-theme>` (tokens.css reads it).
 * "system" removes the attribute, so the OS setting decides.
 */
export function createTheme(preferences: PreferenceStore, root: HTMLElement): Theme {
  const saved = preferences.get('theme');
  const choice = ref<ThemeChoice>(isThemeChoice(saved) ? saved : 'system');
  watchEffect(() => {
    if (choice.value === 'system') delete root.dataset.theme;
    else root.dataset.theme = choice.value;
    preferences.set('theme', choice.value);
  });
  return { choice };
}

export const themeKey: InjectionKey<Theme> = Symbol('paperl10n-theme');

export function useTheme(): Theme {
  const theme = inject(themeKey);
  if (theme === undefined) throw new Error('useTheme() needs createTheme() provided by mountApp()');
  return theme;
}
