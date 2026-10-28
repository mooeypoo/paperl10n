# 0005. Built-in plugins as self-contained folders with a manifest and `#plugin-api`

- Status: accepted
- Date: 2026-10-28

## Context

Every supported system (VitePress, Starlight, banana-i18n, gettext, …) is a format plugin. The
PRD names them `@paperl10n/format-<system>` and `@paperl10n/catalog-<system>` "from day one, so
extracting one later is a move, not a rename". The maintainer wants plugins that may stay
built-in forever, but are *possible* to extract, or to complement with third-party plugins,
without a rewrite. Publishing packages now would mean freezing a plugin SDK before its contract
has settled, plus a package, tsconfig, and version per plugin for one maintainer.

## Decision

- **Plugins are folders in the app, `src/plugins/<id>/`, written as if they were packages.** A
  folder is self-contained: manifest, `index.ts`, implementation, tests, fixtures, README. Moving
  it requires no change anywhere else. This replaces the old `AGENTS.md` placement under a
  domain's `adapters/`: plugins *consume* the `formats` contract and aren't part of the domain.
- **A plugin is a manifest (data) plus a module (code).** `paperl10n-plugin.json` is the single
  source of the plugin's id, kind, API version, and metadata. `index.ts` exports
  `plugin: PluginModule = { manifest, create(host) }`. Built-ins import their manifest as JSON. A
  future third-party loader would read the same file from disk and pass it to the same validator.
- **A plugin's only dependency on the app is `#plugin-api`** (`formats/plugin-api.ts`), a narrow
  facade of contract types and a few pure kernel helpers, with `#plugin-api/testing` for tests.
  The API is plain data and interfaces (no classes, singletons, or `instanceof`), so it can become
  `@paperl10n/plugin-api` unchanged. Its export list is frozen by a test.
- **npm dependencies are declared** in the manifest's `externalDependencies`. Lint allows a plugin
  exactly those imports (from step 9), so the extracted `package.json` is always accurate.
- **Plugins return errors, the registry contains crashes.** The registry validates manifests,
  checks that a plugin's kind matches its manifest, and wraps every call so a throw becomes
  `formats.plugin-failed`. Plugin errors get the plugin's id attached by the registry.
- **Isolation is enforced**: plugins can't import each other, domains, the kernel directly, Node,
  or Electron. Only `app/composition-root.ts` imports a plugin, through its `index.ts`.
- **Plugin fixtures live in the plugin folder** (`fixtures/`), not in `tests/fixtures/`.

## Alternatives considered

- **pnpm workspace packages from day one:** real isolation, but 4–5 extra config files per plugin
  and an SDK package published before the contract is known.
- **Plugins under `formats/adapters/`:** they could reach `formats` internals, and the folder
  wouldn't move as a unit.
- **Identity in code** (`readonly id = 'format-vitepress'`): it would duplicate the manifest and
  give a third-party loader nothing to read without running code.

## Consequences

- Extraction is mechanical (see the checklist in `docs/domains/formats.md`): publish the plugin
  API, move the folder, generate `package.json` from the manifest, change one import specifier.
- A new plugin needs no changes to domain code. It touches the composition root (one import, one
  array entry) and nothing else.
- Each plugin runs the plugin contract kit (step 9), so the invariants are checked uniformly.
