// SPDX-License-Identifier: GPL-3.0-or-later
// What the UI knows about where it runs: the user's stored preferences and the OS languages.
// Provided by mountApp, so tests and the UI harness can pass their own.
import { inject, type InjectionKey } from 'vue';
import type { PreferenceStore } from './preferences';

export interface UiEnvironment {
  readonly preferences: PreferenceStore;
  /** The user's preferred languages, best first (`navigator.languages`). */
  readonly systemLanguages: readonly string[];
}

export const environmentKey: InjectionKey<UiEnvironment> = Symbol('paperl10n-environment');

export function useEnvironment(): UiEnvironment {
  const environment = inject(environmentKey);
  if (environment === undefined) throw new Error('useEnvironment() needs mountApp()');
  return environment;
}
