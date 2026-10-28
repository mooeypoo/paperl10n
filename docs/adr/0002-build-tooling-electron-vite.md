# 0002. Build tooling: electron-vite

- Status: accepted
- Date: 2026-10-28

## Context

An Electron app has three build targets: the main process (Node), the preload (a sandboxed,
single-file CommonJS script), and the renderer (a web page). We want one boring tool for dev
server, hot reload, and production builds, sharing Vite's config with Vitest.

## Decision

- **electron-vite** (v6, on Vite 8) builds all three from `electron.vite.config.ts`:
  - main: `src/main/index.ts` → `out/main/index.js` (ESM);
  - preload: `src/preload/index.ts` → `out/preload/index.cjs`, CommonJS, with dependencies bundled
    (`externalizeDeps: false`). That's what a sandboxed preload requires.
  - renderer: root `src/ui`, entry `src/ui/index.html` → `out/renderer/`.
- The renderer's **Content Security Policy** is injected as a meta tag by a small Vite plugin, from
  `scripts/csp.ts` (tested): strict in production; in development, only Vite's inline styles and
  hot-reload WebSocket are added.
- **`pnpm dev` and `pnpm preview` run through `scripts/run-electron.ts`**, which removes
  `ELECTRON_RUN_AS_NODE` from the environment. VS Code sets that variable for processes its
  extensions spawn (including coding agents). It makes the Electron binary act as plain Node, and
  the app then fails with a misleading "no export named BrowserWindow".
- **Packaging is deferred** to a later milestone (likely electron-builder), together with code
  signing and the app id `io.github.mooeypoo.paperl10n`.

## Alternatives considered

- **Electron Forge + its Vite plugin:** the Vite plugin has long been marked experimental, and
  Forge adds a config model (makers, publishers) we don't need yet.
- **Plain Vite + vite-plugin-electron:** workable, but more manual wiring of the three targets.

## Consequences

- Vite 8 uses Rolldown: build options are `rolldownOptions` (type-aware lint flagged the deprecated
  `rollupOptions`).
- Electron 45 downloads its binary lazily on first use, not in an install script, so pnpm's
  build-script allowlist needs no entry for it.
- On Ubuntu 24.04, Chromium's sandbox works on the maintainer's machine despite
  `kernel.apparmor_restrict_unprivileged_userns=1`. CI's e2e job (step 15) will confirm the same on
  GitHub's runners, and must never fall back to `--no-sandbox`.
