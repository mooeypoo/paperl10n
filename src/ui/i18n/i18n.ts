// SPDX-License-Identifier: GPL-3.0-or-later
// The app's own UI strings, in banana-i18n format (ADR 0009): the format Paper Lion edits, so
// the app can one day be translated with itself.
import Banana from 'banana-i18n';
import { computed, inject, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import en from './messages/en.json';
import he from './messages/he.json';

/** The languages the app's interface is available in, with their text direction. */
export const uiLocales = { en: 'ltr', he: 'rtl' } as const;
export type UiLocale = keyof typeof uiLocales;

export function isUiLocale(value: string): value is UiLocale {
  return Object.hasOwn(uiLocales, value);
}

export interface I18n {
  readonly locale: Ref<UiLocale>;
  readonly direction: ComputedRef<'ltr' | 'rtl'>;
  /** A message by key, with `$1`, `$2`, … filled from `params`. Reactive to `locale`. */
  t(key: string, ...params: (string | number)[]): string;
}

export function createI18n(initial: UiLocale = 'en'): I18n {
  const banana = new Banana(initial, { messages: { en, he }, finalFallback: 'en' });
  const locale = ref<UiLocale>(initial);
  return {
    locale,
    direction: computed(() => uiLocales[locale.value]),
    t(key, ...params) {
      // Reading locale.value makes every caller re-render when the language changes.
      banana.setLocale(locale.value);
      return banana.i18n(key, ...params);
    },
  };
}

export const i18nKey: InjectionKey<I18n> = Symbol('paperl10n-i18n');

export function useI18n(): I18n {
  const i18n = inject(i18nKey);
  if (i18n === undefined) throw new Error('useI18n() needs createI18n() provided by mountApp()');
  return i18n;
}
