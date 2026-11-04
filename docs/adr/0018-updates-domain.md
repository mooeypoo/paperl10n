# 0018. Update notices get their own domain: `updates`

- Status: accepted
- Date: 2026-11-04

## Context

M6 adds update notices, the same as Plot Device's
([the M6 plan](../plan/M6-installer.md), question 6). Paper Lion never downloads or installs
anything itself. Once a day it reads the newest release's `latest.json` from GitHub. When a
newer version is out, it says so and links to the release. The user can dismiss that version
("Not now"), ask by hand in the About window, or turn the daily check off.

Those are rules with edge cases worth unit tests:
- which version is newer;
- when a check is due, including when the clock was set backwards;
- what a dismissed version means;
- reading a saved state or a `latest.json` that isn't what's expected.

None of it is translation work, so it doesn't fit `workspace` or any existing domain. AGENTS.md
asks for an ADR before a new domain.

## Decision

- **A new domain, `updates`**, with no dependencies on other domains (only `shared/kernel`). The
  domain graph gets `updates: []`.
- **`domain/`** (pure):
  - reading and checking a `latest.json` (`format` 1, a plain `x.y.z` version, a date, and
    `https` links to the notes and to the downloads by interface language, with English always
    present; anything else is ignored, never shown);
  - comparing versions;
  - the saved state (when the last answer came, the newest release, the dismissed version, and
    whether daily checks are on), read leniently because it's only a cache;
  - when a check is due.
- **`application/`**:
  - two ports: `UpdateSource` (the newest release, or "unreachable") and `UpdateStateStore` (the
    saved state's text);
  - one use case, `createUpdates`, holding the state for the app's lifetime: the status (the
    setting, and a newer version to mention after a check if one is due), checking now, dismissing
    a version, and turning daily checks on or off.
- **`adapters/`**:
  - the GitHub source, which uses `fetch` in main, follows redirects by hand only to GitHub's hosts,
    and has a size limit and a timeout;
  - the state as a file in the app's data;
  - an in-memory store for the UI harness.
- **The renderer asks; main decides.** Paper Lion's IPC only answers requests
  ([ADR 0006](0006-process-model-and-ipc.md)). So the renderer asks for the status when it starts
  and every few hours, and main fetches only when a check is due. Main never pushes events.
- **Automatic checks run only in a packaged app**, or in development when a test-only setting
  names a local server. The packaged app ignores that setting. A check the user asks for always
  runs.

## Alternatives considered

- **In `app/node/` only:** less ceremony, but the rules (once a day, dismissing, a clock set
  backwards) would only be tested end to end.
- **Inside `workspace`:** that domain is about the open project; update notices have nothing to do
  with it, and it would grow a second purpose.
- **Main pushes "update available" to the page** (as Plot Device does): it needs a new
  main→renderer channel in the contract, only for this. Asking on startup and on a timer gives the
  same result with the request/response IPC Paper Lion already has.

## Consequences

- AGENTS.md lists `updates` with the other domains, and `docs/domains/updates.md` holds its
  vocabulary.
- The two ports get contract suites in `updates/testing/`, run against the fakes and the real
  adapters (the GitHub source against a local HTTP server).
- The IPC contract gains four methods: `getUpdateStatus`, `checkForUpdates`, `dismissUpdate`,
  and `setAutomaticUpdateChecks`.
