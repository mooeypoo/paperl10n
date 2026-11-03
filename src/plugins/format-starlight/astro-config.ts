// SPDX-License-Identifier: GPL-3.0-or-later
// Reads Starlight's `locales` from an Astro config *without running it* (`findStaticProperties`,
// from the plugin API): a plugin never executes project code. Only the plain object literal form
// is understood:
//
//   locales: { root: { label: 'English', lang: 'en' }, 'pt-br': { label: '…', lang: 'pt-BR' } }
//
// Anything dynamic (a variable, a spread, a computed key, a function call) gives `null`, and the
// plugin falls back to folder conventions. The key is the folder (`root`: none); `lang` is the
// BCP 47 tag, defaulting to the key, as in Starlight itself.
import { findStaticProperties } from '#plugin-api';

export interface StarlightLocale {
  /** The locale's folder under the content dir; `''` for Starlight's `root` locale. */
  readonly folder: string;
  /** The `lang` tag as written (or the key, when `lang` is absent and the key isn't `root`). */
  readonly lang: string | null;
}

/** Starlight's locales from an Astro config's text, or `null` if they can't be read statically. */
export function readStarlightLocales(text: string): StarlightLocale[] | null {
  // The first object (Astro's own `i18n.locales` is an array).
  const found = findStaticProperties(text, 'locales').find(({ value }) => value.kind === 'object');
  if (found?.value.kind !== 'object' || !found.value.complete) return null;
  const locales: StarlightLocale[] = [];
  for (const [key, locale] of found.value.properties) {
    if (locale.kind !== 'object') return null; // a variable or a call: dynamic
    const lang = locale.properties.get('lang');
    if (lang !== undefined && lang.kind !== 'string') return null; // `lang` is an expression
    locales.push({
      folder: key === 'root' ? '' : key,
      lang: lang?.value ?? (key === 'root' ? null : key),
    });
  }
  return locales;
}
