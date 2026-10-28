// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `locale` domain: languages, text direction (LTR/RTL), and locale metadata.
// Other domains import this file only, as `#domains/locale`. See docs/domains/locale.md.
export { localeFrom, parseLocale, type Locale, type TextDirection } from './domain/locale.ts';
export {
  createLanguageCatalog,
  type CustomLanguage,
  type Language,
  type LanguageCatalog,
} from './domain/language-catalog.ts';
export { bundledLanguageCatalog } from './domain/bundled-catalog.ts';
export { foldForSearch, searchLanguages } from './domain/language-search.ts';
export {
  suggestLanguages,
  type LanguageSuggestions,
  type SuggestionInput,
} from './domain/language-suggestions.ts';
