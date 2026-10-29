// SPDX-License-Identifier: GPL-3.0-or-later
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import type { PaperLionApi } from '#ipc-contract';
import { createApp, watchEffect, type App as VueApp } from 'vue';
import App from './App.vue';
import { clientKey } from './client';
import { createTheme, themeKey } from './composables/use-theme';
import { environmentKey } from './environment';
import { createI18n, i18nKey, isUiLocale, type UiLocale } from './i18n/i18n';
import { browserPreferences, type PreferenceStore } from './preferences';

export interface MountOptions {
  /** Overrides the saved or system interface language. */
  readonly uiLocale?: UiLocale;
  readonly document?: Document;
  readonly preferences?: PreferenceStore;
  /** The user's preferred languages, best first (`navigator.languages`). */
  readonly systemLanguages?: readonly string[];
}

/** The saved interface language, else the first system language the app has, else English. */
function initialUiLocale(
  preferences: PreferenceStore,
  systemLanguages: readonly string[],
): UiLocale {
  const saved = preferences.get('ui-locale');
  if (saved !== null && isUiLocale(saved)) return saved;
  for (const language of systemLanguages) {
    const base = language.split('-')[0] ?? '';
    if (isUiLocale(base)) return base;
  }
  return 'en';
}

/**
 * Mounts the UI, styles included, with a given client. Electron passes window.paperl10n; tests and
 * the UI harness pass their own. This is the whole seam between the UI and the rest of the app
 * (ADR 0008).
 */
export function mountApp(
  element: Element,
  client: PaperLionApi,
  options: MountOptions = {},
): VueApp {
  const preferences = options.preferences ?? browserPreferences();
  const systemLanguages = options.systemLanguages ?? globalThis.navigator.languages;
  const i18n = createI18n(options.uiLocale ?? initialUiLocale(preferences, systemLanguages));
  const root = (options.document ?? document).documentElement;
  // The chrome follows the interface language; each pane sets its own lang and dir.
  watchEffect(() => {
    root.lang = i18n.locale.value;
    root.dir = i18n.direction.value;
    preferences.set('ui-locale', i18n.locale.value);
  });
  const app = createApp(App);
  app.provide(clientKey, client);
  app.provide(i18nKey, i18n);
  app.provide(themeKey, createTheme(preferences, root));
  app.provide(environmentKey, { preferences, systemLanguages: [...systemLanguages] });
  app.mount(element);
  return app;
}
