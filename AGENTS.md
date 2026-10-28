# AGENTS.md

**paperl10n** ("Paper Lion"; *l10n* read as "lion") is a local desktop app (Electron) for side-by-side translation with first-class RTL:
longform Markdown of static sites (VitePress, Starlight, …) and interface-string catalogs
(banana-i18n first, gettext later). Product scope lives in `docs/PRD.md`.

Naming: use `paperl10n` for every identifier (package names, app id, config file, code symbols).
Use "Paper Lion" only for user-facing display text (window title, about screen, accessible labels).

These rules are binding. If a task seems to require breaking one, stop and ask, or propose an ADR.

## Stack
- TypeScript everywhere, `strict: true`, no `any` (use `unknown` + narrowing).
- Electron (main + preload + renderer), Vue 3 Composition API + `<script setup>`, Vite.
- pnpm, Vitest for tests. Ask before adding any new dependency.

## Architecture: strict DDD, ports & adapters
Code is organized by **domain**, then by **layer**:

```
src/
  domains/<domain>/
    domain/          # entities, value objects, domain services. Pure TS. No I/O.
    application/     # use cases + port interfaces (what the domain needs from outside)
    adapters/        # implementations of ports (fs, Electron, parser libraries)
    testing/         # optional: in-memory fakes and test kits, importable only by tests
    index.ts         # the ONLY public entry point of the domain
  plugins/<name>/    # built-in format plugins, self-contained (see "Formats are plugins")
  shared/
    kernel/          # tiny cross-domain primitives (Result, Locale id, ids). Keep minimal.
    ipc-contract/    # the typed renderer↔main API, defined once
  app/               # wiring: pure app API shared by every composition root; app/node/ for Electron
  main/ preload/     # Electron processes, thin
  ui/                # Vue app. A replaceable adapter, nothing more.
  ui-harness/        # dev-only browser root for the UI over in-memory fixtures; never shipped (ADR 0015)
```

Initial domains (add new ones only via ADR):
- `workspace`: opening a project folder, its config, and discovering translatable resources.
- `document`: longform Markdown/frontmatter model, parsing and serializing, block segmentation.
- `catalog`: message catalogs, messages, documentation (`qqq`), placeholder/plural validation.
- `translation`: source↔target pairing, status (missing/draft/translated/outdated), source-change
  tracking, and hints. Longform translations are paired by section (at headings), never block by
  block or line by line (PRD §7.2).
- `locale`: languages, text direction (LTR/RTL), locale metadata.
- `formats`: the plugin contracts (`DocumentFormat`, `CatalogFormat`) and their registry.

### Dependency rules (enforced by lint, never bypassed)
1. `domain/` imports nothing outside its own domain and `shared/kernel`. No Node, Electron, Vue, or fs.
2. `application/` may import its own `domain/` and the **public `index.ts`** of other domains. Never deep imports.
3. `adapters/` implement ports declared in `application/`. Only adapters touch fs, IPC, or libraries.
4. `ui/` talks to use cases only (through composables). No business logic in components.
5. Dependencies point inward. Nothing imports from `app/` except entry points.
6. No circular dependencies between domains. If two domains need each other, the model is wrong.
   Allowed domain → domain edges are declared in `scripts/domain-graph.ts`; adding one is a reviewed change.
7. Imports go through subpath aliases (`#domains/<domain>`, `#kernel/<module>`, `#plugin-api`),
   which resolve only to entry points, so deep imports into another domain don't resolve.
   Narrow exceptions: `app/` may import adapter files directly, via `#adapters/<domain>/<file>`
   (it's the composition root); so may the dev-only browser root `ui-harness/`, which also mounts
   the UI through `#ui/mount` (ADR 0015); and `*.test.ts` files may import a domain's `testing/`
   entry (a domain's own `testing/` may also use the `testing/` of domains it depends on).

Enforcement: `eslint-plugin-boundaries` (rules), a TypeScript project for pure code without Node or
DOM types (purity), and architecture tests that lint known-bad samples (so rules can't silently rot).
Lint and type checks run in pre-commit and CI; the architecture tests run with the test suite in CI.

## Electron boundary
- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer.
- The renderer never touches Node. The preload exposes a **typed IPC contract** defined in one place:
  `src/shared/ipc-contract/` (`#ipc-contract`). It carries plain DTOs, not domain types.
- The renderer never sends filesystem paths. Main picks folders and hands back opaque handles.
- All file I/O happens in main, behind ports.

## Formats are plugins
Every supported system is an adapter implementing a port from `formats`:
- `DocumentFormat` (VitePress, Starlight, …): detect, list source documents, resolve target paths.
- `CatalogFormat` (banana-i18n, gettext, …): locate catalogs, parse/serialize, declare placeholder syntax.

Core code must never contain `if (format === 'vitepress')`. A new format = a new adapter + fixtures,
with zero changes to domain code. Details: `docs/domains/formats.md`.

Naming: plugins are `@paperl10n/format-<system>` (longform) and `@paperl10n/catalog-<system>` (strings).
Use these names for built-in plugins too, so any of them can be extracted into its own package.

Built-in plugins live in `src/plugins/<name>/` and are written as if they were already packages:
- **Self-contained folder:** `paperl10n-plugin.json` (manifest), `index.ts`, source, tests,
  `fixtures/`, `README.md`. Moving the folder out must not require touching anything else.
- **Imports only `#plugin-api`** (the narrow plugin surface of `formats`) and the external
  libraries its manifest declares. Never other plugins, never domain internals, never fs/Electron.
  Its tests may also use `#plugin-api/testing` and `vitest`, nothing else.
- **Only `app/` imports a plugin**, through its `index.ts`. Core code never names a plugin.
- The manifest is data and the single source of the plugin's id, kind, and API version.

## UI and design
- The UI is swappable. Vue lives only in `ui/`, and its state comes from use cases.
- Styling uses design tokens (CSS custom properties). No hard-coded colors or spacing.
- **RTL is not an afterthought:** use logical CSS properties only (`margin-inline-start`,
  `inset-inline-end`, `text-align: start`). Each pane sets its own `dir` and `lang`. Never assume LTR.
- The app's own UI strings are i18n-ready from day one.

## Testing
- Domain and application layers get unit tests with in-memory port fakes. No mocking libraries needed.
- Every format plugin has fixture-based tests (sample projects in `src/plugins/<name>/fixtures/`)
  and passes the shared plugin contract test kit. Other adapters keep fixtures in `tests/fixtures/`.
- Round-trip rule: parse → serialize must not change a document that wasn't edited.
- Every port has a contract test suite (in its domain's `testing/`) that runs against the in-memory
  fake *and* every real adapter, so fakes can't drift from reality.
- The plugin API's export list is frozen by a test. Changing what plugins see is a deliberate diff.
- Every IPC method is tested end to end without Electron (preload → validation → handler → use case).
- Every use case tests its success path and each error it can return. Every domain rule gets
  table-driven tests, including malformed input.
- Tests are deterministic and fast: no network, no real dialogs, no sleeps.

## Working style for agents
- Make small, focused changes. Leave the build, lint, and tests green.
- New domain, new layer, or a broken rule → write an ADR in `docs/adr/NNNN-title.md` first.
- Update the relevant `docs/` file when behavior or contracts change.
- Prefer explicit names over clever ones. No barrel re-exports except each domain's `index.ts`,
  its optional `testing/index.ts`, and `formats`' `plugin-api.ts`.
- Source files start with `SPDX-License-Identifier: GPL-3.0-or-later` (fixtures and JSON exempt).

## More docs (create as they become relevant)
- `docs/PRD.md`: product scope, glossary, milestones, open questions.
- `docs/architecture.md`: the big picture and data flow.
- `docs/domains/<domain>.md`: the ubiquitous language and invariants per domain.
- `docs/adr/`: decision records.