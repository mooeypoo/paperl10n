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
    adapters/        # implementations of ports (fs, IPC, parsers, site-format plugins)
    index.ts         # the ONLY public entry point of the domain
  shared/kernel/     # tiny cross-domain primitives (Result, Locale id, ids). Keep minimal.
  app/               # composition root: wires adapters into use cases
  main/ preload/     # Electron processes, thin
  ui/                # Vue app. A replaceable adapter, nothing more.
```

Initial domains (add new ones only via ADR):
- `workspace`: opening a project folder, its config, and discovering translatable resources.
- `document`: longform Markdown/frontmatter model, parsing and serializing, block segmentation.
- `catalog`: message catalogs, messages, documentation (`qqq`), placeholder/plural validation.
- `translation`: source↔target pairing, status (missing/draft/translated/outdated), alignment and sync.
- `locale`: languages, text direction (LTR/RTL), locale metadata.
- `formats`: the plugin contracts (`DocumentFormat`, `CatalogFormat`) and their registry.

### Dependency rules (enforced by lint, never bypassed)
1. `domain/` imports nothing outside its own domain and `shared/kernel`. No Node, Electron, Vue, or fs.
2. `application/` may import its own `domain/` and the **public `index.ts`** of other domains. Never deep imports.
3. `adapters/` implement ports declared in `application/`. Only adapters touch fs, IPC, or libraries.
4. `ui/` talks to use cases only (through composables). No business logic in components.
5. Dependencies point inward. Nothing imports from `app/` except entry points.
6. No circular dependencies between domains. If two domains need each other, the model is wrong.

Enforcement: `eslint-plugin-boundaries` (or dependency-cruiser) runs in CI and pre-commit.

## Electron boundary
- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer.
- The renderer never touches Node. The preload exposes a **typed IPC contract** defined in one place.
- All file I/O happens in main, behind ports.

## Formats are plugins
Every supported system is an adapter implementing a port from `formats`:
- `DocumentFormat` (VitePress, Starlight, …): detect, list source documents, resolve target paths.
- `CatalogFormat` (banana-i18n, gettext, …): locate catalogs, parse/serialize, declare placeholder syntax.

Core code must never contain `if (format === 'vitepress')`. A new format = a new adapter + fixtures,
with zero changes to domain code. Details: `docs/domains/formats.md`.

Naming: plugins are `@paperl10n/format-<system>` (longform) and `@paperl10n/catalog-<system>` (strings).
Use these names for built-in plugins too, so any of them can be extracted into its own package.

## UI and design
- The UI is swappable. Vue lives only in `ui/`, and its state comes from use cases.
- Styling uses design tokens (CSS custom properties). No hard-coded colors or spacing.
- **RTL is not an afterthought:** use logical CSS properties only (`margin-inline-start`,
  `inset-inline-end`, `text-align: start`). Each pane sets its own `dir` and `lang`. Never assume LTR.
- The app's own UI strings are i18n-ready from day one.

## Testing
- Domain and application layers get unit tests with in-memory port fakes. No mocking libraries needed.
- Every format adapter has fixture-based tests (a sample project in `tests/fixtures/<format>/`).
- Round-trip rule: parse → serialize must not change a document that wasn't edited.

## Working style for agents
- Make small, focused changes. Leave the build, lint, and tests green.
- New domain, new layer, or a broken rule → write an ADR in `docs/adr/NNNN-title.md` first.
- Update the relevant `docs/` file when behavior or contracts change.
- Prefer explicit names over clever ones. No barrel re-exports except each domain's `index.ts`.

## More docs (create as they become relevant)
- `docs/PRD.md`: product scope, glossary, milestones, open questions.
- `docs/architecture.md`: the big picture and data flow.
- `docs/domains/<domain>.md`: the ubiquitous language and invariants per domain.
- `docs/adr/`: decision records.