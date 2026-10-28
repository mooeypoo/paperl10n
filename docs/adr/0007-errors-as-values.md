# 0007. Errors as values: `Result` and coded errors

- Status: accepted
- Date: 2026-10-28

## Context

Paper Lion has many expected failures: an unreadable file, an invalid config, an unknown locale, a
plugin that doesn't recognize a project. These cross several boundaries: plugin → use case → IPC →
UI. Exceptions lose their type at every boundary, and Electron's IPC reduces a thrown error in main
to a generic `Error` with a prefixed message in the renderer, dropping custom fields. The UI also
has to show every failure as a translated message (the app's UI is i18n-ready from day one).

## Decision

- **Expected failures are returned, not thrown**, as `Result<T, E>` from `#kernel/result`:
  `{ ok: true, value } | { ok: false, error }`, built with `ok()` and `err()`. Async operations
  return `Promise<Result<…>>`, and those promises don't reject for expected failures.
- **Errors are plain, serializable objects** with a string-literal `code`, plus whatever fields
  explain them: `{ code: 'project-path.invalid', reason: 'absolute', input: '/etc' }`. No `Error`
  subclasses for expected failures.
- **Codes are namespaced** `<area>.<kebab-case>` (`workspace.config-invalid`,
  `formats.plugin-failed`). Each code that can reach the UI has a message in the UI's message files,
  so a code works as an i18n key. A test enforces that once the UI exists.
- **Throw only for bugs**: broken invariants, impossible states. Those are programmer errors and
  should be loud.
- **Adapters are the conversion boundary.** Code that calls libraries, fs, or Electron catches their
  exceptions and returns coded errors. The format registry does the same around every plugin call.
  The IPC layer wraps each handler, so an unexpected throw becomes
  `{ code: 'internal.unexpected' }` and is logged. A promise never rejects across IPC.
- `Result` stays minimal (type, `ok`, `err`). No chaining helpers until repeated code shows a real
  need.

## Alternatives considered

- **Exceptions everywhere.** Idiomatic JavaScript, but the error type is invisible in signatures,
  and the error loses its fields across IPC.
- **`neverthrow` or a similar library.** Well-made, but a dependency and a chaining style
  (`andThen`, `match`) that a newcomer has to learn. A four-line type covers our needs.
- **`Error` subclasses with `instanceof`.** Doesn't survive structured cloning over IPC, and ties
  plugins to classes from core, which would block extracting plugins later.

## Consequences

- Signatures show what can go wrong, and `switch (error.code)` is checked for exhaustiveness.
- Some extra `if (!result.ok) return result;` lines in use cases. That's acceptable.
- Plugins return the same plain error shapes, so the plugin API has no classes to share.
