# 0003. Boundary enforcement: boundaries plugin, purity projects, architecture tests

- Status: accepted
- Date: 2026-10-28

## Context

`AGENTS.md` sets strict dependency rules: pure domain code, domains talking only through their
public `index.ts`, no cycles, I/O only in adapters, and a UI that only talks to use cases. Rules
that aren't checked erode, especially with coding agents writing code. The checks must run in the
editor, in pre-commit, and in CI, and must not silently stop working when a tool is upgraded.

## Decision

Three layers, from structural to behavioral:

1. **TypeScript purity projects.** `tsconfig.core.json` covers the kernel and every domain's
   `index.ts`, `domain/`, and `application/`. It has no Node types and no DOM lib, so `node:fs`,
   `process`, or `window` there is a type error.
2. **ESLint rules** (`scripts/eslint/architecture.ts`):
   - `eslint-plugin-boundaries` v7, rule `boundaries/dependencies`, default **disallow**, checking
     Node and npm imports (`checkAllOrigins`) and layers inside a domain (`checkInternals`).
     Policies are **generated per domain from `scripts/domain-graph.ts`**, the single declaration of
     allowed domain → domain edges. Cross-domain imports must target the other domain's `index.ts`.
   - `boundaries/no-unknown-files`: a file outside every known area under `src/` is an error.
   - Custom rule `paperl10n/no-relative-cross-unit-imports`: a relative import may not leave its
     domain, plugin, or layer folder. Cross-unit imports go through `#` aliases (ADR 0004).
   - Violation messages point to the rule in `AGENTS.md`.
3. **Architecture tests** (`tests/architecture/`): every rule has a sample that must be reported and
   positive controls that must pass. They lint virtual files at real paths through ESLint's API. A
   type-aware sample checks that `typescript-eslint`'s typed rules still run. `scripts/domain-graph.ts`
   has tests proving it's acyclic and matches the folders in `src/domains/`.

## Alternatives considered

- **dependency-cruiser.** Strong at cycles and graph output, but it's a second tool with its own
  config language and no in-editor feedback. The declared graph plus a cycle test covers cycles.
- **Handlebars templates in boundaries policies** (`{{ from.… }}`) instead of generated policies.
  More compact, but harder to read and to debug. Generated policies make every allowed edge explicit.
- **`boundaries/entry-point`.** Deprecated in v7; its job is folded into `boundaries/dependencies`.
- **Path aliases alone** (no lint). They stop deep imports through the alias, but not relative
  ones, and not wrong-direction imports.

## Consequences

- Adding a domain = a folder + an entry in `scripts/domain-graph.ts` (a test fails until both
  exist) + an ADR. Adding an edge is a one-line, reviewable diff.
- A new area under `src/` must be added to `scripts/eslint/architecture.ts`, or lint fails.
- Each milestone step that adds a new kind of element also adds its violation samples. Samples
  need real target files, so they arrive with the code they guard.
- Running ESLint in tests makes the architecture suite the slowest one (about 1.5 s). That's
  acceptable for the guarantee.
