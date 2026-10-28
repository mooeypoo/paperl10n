# 0015. A browser UI harness as a testing aid

- Status: accepted
- Date: 2026-10-28

## Context

Iterating on the UI inside Electron is slow: every change goes through the main process, the
preload, and a native folder dialog. UI tests with a fake client are fast, but the fake is
hand-written, so it can drift from what the real use cases return. The UI/UX design work after M0
needs a quick loop over realistic data.

Paper Lion is a desktop app. Anything that runs in a browser must not become a second product
target, ship in the app, or weaken the Electron boundary.

## Decision

- **`src/ui-harness/` is a browser composition root** (`pnpm dev:harness`, served by Vite on
  `localhost:5174`). It mounts the same UI through `mountApp()` on the same `createAppApi` the
  Electron app uses, with real use cases, the real format registry, and the built-in plugins.
- **Substituted, each with a reason to trust it:**
  - Files: in-memory copies of every plugin's `fixtures/` (bundled by a Vite glob import), read by
    `InMemoryProjectFiles`. It moved from `formats/testing/` to `formats/adapters/` for this: it's
    a real adapter that passes the same contract suite as the disk adapter, and the harness can't
    import a `testing/` entry (those pull in Vitest).
  - Transport: `cloningTransport` `structuredClone`s every request and result, like Electron's IPC.
    A result that couldn't cross IPC rejects here too (tested).
  - Folder dialog: "Open folder…" always opens one project, chosen with
    `?fixture=<plugin>/<fixture>` or `?fixture=examples/<name>`. The default is
    `examples/sample-docs`, the hand-editable sample project (added after M0). An unknown name
    gives the real "folder unavailable" error.
  - Sessions: `InMemoryProjectSessions` with `crypto.randomUUID` ids.
- **Boundaries.** `ui-harness` is its own lint element. It may import the kernel, the IPC
  contract, shared `app/` code, domain entry points and adapters, `src/ui/mount.ts` (alias
  `#ui/mount`) and nothing else from the UI, and npm packages except `electron`. Never Node, never
  `app/node/` (now its own element, `app-node`, so shared `app/` code can't import it either), and
  nothing may import the harness. Architecture samples cover each rule. Its code is in its own
  TypeScript project (`tsconfig.harness.json`: DOM types, no Node).
- **Never shipped.** The harness has no build script. `pnpm build` runs
  `scripts/check-app-build.ts`, which fails if the app build is incomplete or contains the
  harness's marker string (`paperl10n-ui-harness`, written onto the harness page).
- **What it proves:** the UI works on the real app wiring and real plugin output, across a
  transport that copies data. **What it doesn't:** the preload, the renderer sandbox, the
  production CSP (the harness uses the dev policy), IPC sender and argument validation, real disk
  behavior (symlinks, permissions, encodings), and native dialogs and menus. The Electron
  end-to-end test (M0 step 15) is the authority for those.

## Alternatives considered

- **No harness, Electron only:** the slowest loop for design work, and UI tests keep relying only
  on hand-written fakes.
- **A web build of the app:** a second product target, with pressure for web-only features
  (routing, storage, hosting). Rejected in the UI/UX review.
- **A harness on the hand-written fake client:** fast, but proves nothing about the real use cases.

## Consequences

- Design experiments and UI-flow tests can run in a plain browser on realistic data.
- A new fixture in any plugin, or a new sample project in `examples/`, shows up in the harness
  automatically.
- A new API method must be added to `cloningTransport` (a compile error until it is), as with the
  preload and `guardApi`.
- No web-only features get built for the harness. If browser Playwright tests are added later, they
  supplement the Electron end-to-end test, never replace it.
