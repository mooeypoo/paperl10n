# 0006. Electron process model and the typed IPC contract

- Status: accepted
- Date: 2026-10-28

## Context

`AGENTS.md` requires a sandboxed renderer without Node, all file I/O in main behind ports, and a
typed IPC contract defined in one place. The renderer must be treated as untrusted: a bug or an
injected script there must not be able to read arbitrary files or reach Node.

## Decision

**Processes**

| Process | Code | Can use |
|---|---|---|
| main | `src/main/` (thin) + `src/app/node/` (composition root) | Node, Electron, all of `app/` |
| preload | `src/preload/` | `electron` (`contextBridge`, `ipcRenderer`) and `#ipc-contract` only |
| renderer | `src/ui/` | `#ipc-contract`, kernel types, npm UI packages. Never Node or Electron (lint). |

**Hardening** (`src/main/window.ts`, unit-tested): `contextIsolation`, `sandbox`, no Node
integration anywhere, `webSecurity`, no `<webview>`, no drag-and-drop navigation,
`app.enableSandbox()`, navigation locked to the app's own page, every new window denied, every
permission request and check denied, a strict CSP (ADR 0002), and `userData` under `paperl10n`.

**The contract** (`#ipc-contract`, ADR 0004 amendment): plain DTOs, the list of error codes, the
`PaperLionApi` interface, and `apiMethods` (a compile error if incomplete).

- The **preload** exposes `window.paperl10n = createApi(ipcRenderer.invoke)`. `createApi` is pure
  and tested, and it forwards only the contract's fields. It's the one place results crossing the
  boundary are asserted to the contract's types.
- **Main** (`src/main/ipc.ts`) registers one handler per method. Each checks that the sender is
  the app's own top-level frame and validates the arguments against the contract
  (`argumentValidators`, one per method, a compile error if missing). A rejected request gets
  `internal.invalid-request` and never reaches the app.
- The app side (`src/app/`) maps domain results to DTOs and turns any unexpected throw into
  `internal.unexpected` (`guardApi`). **A promise never rejects across IPC.**
- **The renderer never sends a filesystem path.** Main shows the folder dialog and returns an
  opaque project id; every later call uses that id.

## Alternatives considered

- **Domain types over IPC:** less code, but it couples the UI to domain internals, and branded or
  class values don't survive structured cloning.
- **A schema library for validation** (zod, valibot): a dependency for two small validators.
  Revisit when the API grows.
- **A custom `app://` protocol instead of `file://`:** better origin isolation. Worth doing with
  packaging, since navigation is already locked and the CSP is strict.

## Consequences

- A new API method touches the contract, `apiMethods`, the app handlers, `guardApi`, the
  validators, and the preload. The compiler flags each one that's missing.
- Security settings regress only if their unit tests are changed.
