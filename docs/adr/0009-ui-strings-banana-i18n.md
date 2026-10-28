# 0009. The app's own UI strings in banana-i18n format

- Status: accepted
- Date: 2026-10-28

## Context

`AGENTS.md` requires the app's UI strings to be i18n-ready from day one. Paper Lion edits
banana-i18n catalogs (its first catalog format), and it should eventually be translatable with
itself. Errors reach the UI as codes (ADR 0007) and need translated messages.

## Decision

- Messages live in `src/ui/i18n/messages/`: `en.json` (source), `qqq.json` (documentation for
  translators), and translations (`he.json` first), in banana-i18n format with `@metadata`.
  Keys are `paperl10n-…`.
- **`banana-i18n`** formats them (`$1` parameters, `{{PLURAL:…}}`, `{{GENDER:…}}`). `createI18n`
  wraps it with a reactive locale; `useI18n()` gives components `t(key, …params)`.
- The **interface language** sets `<html lang dir>`; each content pane still sets its own. The UI
  languages and their directions are listed in `uiLocales` (`en`, `he`).
- **Error codes map to messages** `paperl10n-error-<area>-<code>`. `errorMessageParams` lists, per
  code, which DTO params fill `$1`, `$2`, … (a `Record<ErrorCode, …>`, so a new code is a compile
  error until it has a message).
- **Tests keep the files honest:** every English key is documented in `qqq.json`; Hebrew has no
  stray keys; every error code has a message and documentation; each error message uses exactly
  the parameters it's given; translations use the same *set* of parameters as English.

## Alternatives considered

- **vue-i18n:** heavier, with a different message syntax from the one Paper Lion builds tools for.
- **Hand-rolled `$1` replacement:** fine until the first plural; banana-i18n is small and does it
  right.

## Consequences

- A plural form may legitimately omit the number (Hebrew "one document" is `מסמך אחד`, "one
  document", without `$1`), so parameter checks compare sets, not counts. The same nuance applies
  to M4's placeholder validation for user catalogs.
- Plugin-provided texts and config warnings are still English; they're marked `lang="en"` where
  shown. Translating them is later work.
