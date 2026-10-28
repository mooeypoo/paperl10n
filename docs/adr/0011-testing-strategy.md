# 0011. Testing strategy: contract suites, the plugin kit, guarded guards

- Status: accepted
- Date: 2026-10-28

## Context

Paper Lion's riskiest code sits at its seams: ports and their adapters, the plugin API, the IPC
contract, and the architecture rules themselves. In a solo project those seams break silently: a
fake drifts from the real adapter, a lint rule stops matching after an upgrade, a new plugin skips
an invariant nobody remembered. Tests must catch that, stay fast, and need no mocking library.

## Decision

- **Vitest** for everything except the Electron end-to-end smoke test (Playwright, step 15). Tests
  sit next to the code (`*.test.ts`); fixtures are committed sample projects. Plugin fixtures live
  in the plugin's `fixtures/`, others in `tests/fixtures/`. All fixtures are byte-exact
  (`.gitattributes`). The UI gets its own Vitest project (happy-dom) in step 13.
- **Every port has a contract suite** in its domain's `testing/` (e.g.
  `describeProjectFilesContract`), run against the in-memory fake *and* every real adapter, so
  use-case tests can trust the fakes.
- **Every plugin runs the plugin contract kit** (`describePluginContract` from
  `#plugin-api/testing`): manifest validity, id = folder name, registration, behavior on an empty
  project, rejection of unknown options, deterministic detection, stable and unique source listings
  whose files exist, source-locale identity mapping, and distinct target paths. Plus its own
  fixture tests with exact expected output.
- **Guards are tested too.** The kit is tested against deliberately broken plugins, one per
  invariant. The architecture rules have violation samples *and* positive controls. When a new
  guard is added, it's mutation-checked once by hand (disable it, watch its test fail). Those checks
  are recorded in the plan's done-notes.
- **Public surfaces are frozen by tests**: each domain's runtime exports, `#plugin-api`, and
  `#plugin-api/testing`. Changing what other code (or plugins) can see is a visible diff.
- **Coverage floor**: 90% lines, branches, functions, and statements on pure code (`shared/`,
  `domain/`, `application/`, plugins, `scripts/spdx.ts`), via `@vitest/coverage-v8`, enforced in
  CI. The floor is a safety net. Points above are the goal.
- **Deterministic and fast**: no network, no real dialogs, no sleeps. Temp folders are created and
  removed by the tests. The whole suite runs in a few seconds.

## Alternatives considered

- **Jest:** slower, and needs a separate TypeScript transform. Vitest reuses the Vite config.
- **Mocking libraries:** in-memory fakes that pass the same contract suite as real adapters are
  more trustworthy than per-test mocks, and need no dependency.
- **Snapshot tests for UI and outputs:** easy to approve without reading. We assert behavior and
  attributes instead.

## Consequences

- Adding a port means adding its contract suite. Adding a plugin means calling the kit, and
  adding a kit check means adding a broken-plugin case for it.
- The suite is larger than the code it guards in places. That's deliberate for the seams.

## Amendment (2026-10-28, M0 step 15)

The Electron end-to-end tests (`pnpm test:e2e`, `tests/e2e/`) run the **built** app under
Playwright's `_electron`, through `scripts/run-electron.ts`. Only the native folder dialog is
stubbed, in the main process (`app.evaluate`), so everything else is real: the sandboxed renderer,
the preload, IPC validation, main, the disk adapter, and `format-stub`. They assert that both panes
render with their own `lang`/`dir`, that the renderer has no Node globals and the preload exposes
exactly `apiMethods`, that the renderer runs under the sandbox's seccomp filter (Linux), and that
no CSP violation or console error happens from the first script on. A positive control proves a
CSP violation would be caught.

CI runs them in an `e2e` job on the same two Ubuntu images as Check, under `xvfb-run`, after
installing the AppArmor profile from `docs/development/linux-sandbox.md`. The sandbox stays on.
