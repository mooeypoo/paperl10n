// SPDX-License-Identifier: GPL-3.0-or-later
import { localeId, type InvalidLocaleId, type LocaleId } from '#kernel/locale-id';
import { ok, type Result } from '#kernel/result';
import { bundledLanguageCatalog } from './bundled-catalog.ts';
import type { LanguageCatalog } from './language-catalog.ts';

export type TextDirection = 'ltr' | 'rtl';

/** A locale and the facts about it the app relies on. Created only through `localeFrom`. */
export interface Locale {
  readonly id: LocaleId;
  readonly direction: TextDirection;
}

/** ISO 15924 scripts written right to left: for tags the catalog doesn't know (`az-Arab-IR`). */
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

/** Deprecated codes still found in the wild that the catalog doesn't list. */
const legacyCodes: Readonly<Record<string, string>> = { iw: 'he', ji: 'yi' };

const SCRIPT_SUBTAG = /^[A-Z][a-z]{3}$/;

/**
 * Text direction for a locale, from the language catalog (docs/domains/locale.md):
 * 1. a language the catalog knows (or the project's config defines) has its own direction;
 * 2. otherwise an explicit script subtag decides (`az-Arab-IR` is RTL, `ku-Latn-TR` is LTR);
 * 3. otherwise the base language does (`ar-EG` → `ar`), and unknown languages are LTR.
 */
function directionOf(id: LocaleId, catalog: LanguageCatalog): TextDirection {
  const known = catalog.find(id);
  if (known !== undefined) return known.direction;
  const [language = '', ...rest] = id.split('-');
  // Private-use subtags (after `x`) never carry a script.
  const publicSubtags = rest.slice(0, rest.indexOf('x') === -1 ? undefined : rest.indexOf('x'));
  const script = publicSubtags.find((subtag) => SCRIPT_SUBTAG.test(subtag));
  if (script !== undefined) return rtlScripts.has(script) ? 'rtl' : 'ltr';
  return catalog.find(legacyCodes[language] ?? language)?.direction ?? 'ltr';
}

/** The `Locale` for an id, with its direction from the catalog (the bundled one by default; pass
 * one with the project's custom languages to honor its config). */
export function localeFrom(
  id: LocaleId,
  catalog: LanguageCatalog = bundledLanguageCatalog(),
): Locale {
  return { id, direction: directionOf(id, catalog) };
}

/** Validates a raw tag (see `localeId`) and returns its `Locale`. */
export function parseLocale(input: string): Result<Locale, InvalidLocaleId> {
  const id = localeId(input);
  return id.ok ? ok(localeFrom(id.value)) : id;
}
