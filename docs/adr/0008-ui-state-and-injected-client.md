# 0008. UI state: composables over an injected client

- Status: accepted
- Date: 2026-10-28

## Context

The UI must be a replaceable adapter (`AGENTS.md`): no business logic in components, state from use
cases only, and testable without Electron. It talks to the app only through the IPC contract.

## Decision

- **The client is injected.** `mountApp(element, client)` (`src/ui/mount.ts`) provides a
  `PaperLionApi` through Vue's `provide/inject` (`clientKey`, `useClient()`). Electron passes
  `window.paperl10n`; tests and the UI harness (step 14) pass their own. Only `src/ui/main.ts`
  reads `window.paperl10n`.
- **State lives in composables** (`src/ui/composables/`), plain TypeScript over Vue refs: for
  example `useProject(client)` holds the open project, its documents, the last error, and a busy
  flag. Only the newest request may update the state, so slow answers can't overwrite newer ones.
  A rejected call (a broken transport, since the API itself never rejects) becomes
  `internal.unexpected`.
- **Components only render** composable state and send events back. Logic stays in `.ts` files,
  where type-aware lint rules apply (they don't run on `.vue` files; ADR 0010).
- **No global store** (Pinia) yet.

## Alternatives considered

- **Pinia:** well supported, with devtools, but a dependency and a concept we don't need for one
  view. Revisit when several views share long-lived state (likely with the catalog editor in M4).
- **Components calling `window.paperl10n` directly:** untestable without Electron, and it ties the
  UI to one transport.

## Consequences

- UI tests mount the real app with a fake client (`src/ui/test-support.ts`), with no Electron.
- The browser UI harness is just another caller of `mountApp`.
