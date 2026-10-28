// SPDX-License-Identifier: GPL-3.0-or-later
import { localeId, type InvalidLocaleId, type LocaleId } from '#kernel/locale-id';
import { ok, type Result } from '#kernel/result';

export type TextDirection = 'ltr' | 'rtl';

/** A locale and the facts about it the app relies on. Created only through `localeFrom`. */
export interface Locale {
  readonly id: LocaleId;
  readonly direction: TextDirection;
}

// Placeholder data until M1 chooses a real language-data source (docs/plan/M1-languages.md).
// Callers only see `localeFrom`, so replacing these tables doesn't change them.

/** ISO 15924 scripts written right to left. */
const rtlScripts: ReadonlySet<string> = new Set([
  'Adlm', // Adlam
  'Arab', // Arabic
  'Aran', // Arabic (Nastaliq)
  'Hebr', // Hebrew
  'Mand', // Mandaic
  'Mend', // Mende Kikakui
  'Nkoo', // N'Ko
  'Rohg', // Hanifi Rohingya
  'Samr', // Samaritan
  'Syrc', // Syriac
  'Thaa', // Thaana
  'Yezi', // Yezidi
]);

/** Languages whose usual script (when the tag names none) is written right to left. */
const rtlLanguages: ReadonlySet<string> = new Set([
  'ar', // Arabic
  'azb', // South Azerbaijani
  'ckb', // Central Kurdish (Sorani)
  'dv', // Dhivehi
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew (deprecated code, still found in the wild)
  'ji', // Yiddish (deprecated code)
  'ks', // Kashmiri
  'lrc', // Northern Luri
  'mzn', // Mazanderani
  'nqo', // N'Ko
  'pnb', // Western Punjabi
  'prs', // Dari
  'ps', // Pashto
  'sd', // Sindhi
  'sdh', // Southern Kurdish
  'syr', // Syriac
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);

const SCRIPT_SUBTAG = /^[A-Z][a-z]{3}$/;

/**
 * Text direction for a locale. An explicit script subtag decides (`az-Arab` is RTL, `ku-Latn`
 * is LTR); otherwise the language's usual script does. Unknown languages are LTR.
 */
function directionOf(id: LocaleId): TextDirection {
  const [language = '', ...rest] = id.split('-');
  // Private-use subtags (after `x`) never carry a script.
  const publicSubtags = rest.slice(0, rest.indexOf('x') === -1 ? undefined : rest.indexOf('x'));
  const script = publicSubtags.find((subtag) => SCRIPT_SUBTAG.test(subtag));
  if (script !== undefined) return rtlScripts.has(script) ? 'rtl' : 'ltr';
  return rtlLanguages.has(language) ? 'rtl' : 'ltr';
}

export function localeFrom(id: LocaleId): Locale {
  return { id, direction: directionOf(id) };
}

/** Validates a raw tag (see `localeId`) and returns its `Locale`. */
export function parseLocale(input: string): Result<Locale, InvalidLocaleId> {
  const id = localeId(input);
  return id.ok ? ok(localeFrom(id.value)) : id;
}
