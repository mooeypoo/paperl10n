// SPDX-License-Identifier: GPL-3.0-or-later
import './styles/tokens.css';
import './styles/base.css';
import type { PaperLionApi } from '#ipc-contract';
import { createApp, watchEffect, type App as VueApp } from 'vue';
import App from './App.vue';
import { clientKey } from './client';
import { createI18n, i18nKey, type UiLocale } from './i18n/i18n';

/**
 * Mounts the UI, styles included, with a given client. Electron passes window.paperl10n; tests and
 * the UI harness pass their own. This is the whole seam between the UI and the rest of the app
 * (ADR 0008).
 */
export function mountApp(
  element: Element,
  client: PaperLionApi,
  options: { readonly uiLocale?: UiLocale; readonly document?: Document } = {},
): VueApp {
  const i18n = createI18n(options.uiLocale ?? 'en');
  const root = (options.document ?? document).documentElement;
  // The chrome follows the interface language; each pane sets its own lang and dir.
  watchEffect(() => {
    root.lang = i18n.locale.value;
    root.dir = i18n.direction.value;
  });
  const app = createApp(App);
  app.provide(clientKey, client);
  app.provide(i18nKey, i18n);
  app.mount(element);
  return app;
}
