// SPDX-License-Identifier: GPL-3.0-or-later
// Public API of the `locale` domain: languages, text direction (LTR/RTL), and locale metadata.
// Other domains import this file only, as `#domains/locale`. See docs/domains/locale.md.
export { localeFrom, parseLocale, type Locale, type TextDirection } from './domain/locale.ts';
