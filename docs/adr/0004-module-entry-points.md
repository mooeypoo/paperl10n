# 0004. Module entry points: subpath imports, adapters visible only to `app/`, `testing/` entries

- Status: accepted
- Date: 2026-10-28

## Context

`AGENTS.md` says each domain's `index.ts` is its only public entry point, with no barrels
elsewhere. In practice three more needs appear:

- the composition root (`app/`) must construct concrete adapters, but exporting adapters from
  `index.ts` would pull Node code into everything that imports the domain (including pure code and,
  through types, the UI);
- tests in one domain need in-memory fakes and contract suites from another domain;
- plugins need a narrow, stable surface they can depend on when extracted into packages.

Imports should also be short, uniform, and impossible to aim at a domain's internals.

## Decision

- **Subpath imports** in `package.json` `imports` are the only way across units. Each alias
  resolves directly to an entry file, so a deep import doesn't even resolve:

  | Alias | Resolves to |
  |---|---|
  | `#kernel/<module>` | `src/shared/kernel/<module>.ts` |
  | `#domains/<name>` | `src/domains/<name>/index.ts` |
  | `#domain-testing/<name>` | `src/domains/<name>/testing/index.ts` |
  | `#plugin-api`, `#plugin-api/testing` | `formats`' plugin surface (added in step 7) |
  | `#plugins/<name>` | `src/plugins/<name>/index.ts` (added in step 9) |
  | `#ipc-contract` | `src/shared/ipc-contract.ts` (added in step 12) |

  TypeScript (`moduleResolution: bundler`), Vite, Vitest, and the ESLint resolver all read this one
  declaration. Relative imports stay inside their unit (ADR 0003's custom rule).
- **`index.ts` exports only pure code** (`domain/` and `application/`), never adapters.
- **`app/` may import adapter files directly**, as the one exception to "only through `index.ts`".
  It's the composition root, and knowing concrete adapters is its job.
- **A domain may have a `testing/index.ts`** with fakes and contract suites. Only `*.test.ts` files
  (and other `testing/` folders) may import it.
- Allowed barrels: each domain's `index.ts`, its optional `testing/index.ts`, and `formats`'
  `plugin-api.ts`. No others.

## Alternatives considered

- **`tsconfig` `paths` + a Vite alias:** works, but the mapping has to be kept in sync in several
  tools. It remains the fallback if a tool stops supporting subpath imports.
- **Exporting adapters from `index.ts`:** simplest, but it breaks the purity of everything
  importing a domain.
- **A second public entry per domain (`adapters.ts`):** more surface and more barrels for one
  consumer. Direct imports from `app/` are clearer.

## Consequences

- Every cross-unit import reads the same way: `#domains/formats`, `#kernel/result`.
- The aliases are verified by tests (the kernel tests import through `#kernel/…`) and by hand
  (a deep `#domains/…/domain/x` import fails with TS2307).
- When a plugin is extracted, its `#plugin-api` imports change to `@paperl10n/plugin-api`, a
  one-line change per file.

## Amendment (2026-10-28, M0 step 8)

`app/` importing adapters "directly" needs an alias too: a relative path from `src/app/` into a
domain is (rightly) rejected by the no-relative-cross-unit rule. So each domain that has
adapters gets one `imports` entry:

| Alias | Resolves to |
|---|---|
| `#adapters/<domain>/<file>` | `src/domains/<domain>/adapters/<file>.ts` |

Node's subpath patterns allow a single `*`, so there's one line per domain
(`"#adapters/formats/*": "./src/domains/formats/adapters/*.ts"`). Lint allows the alias only from
`app/`, the domain's own adapters and `testing/`, and tests.

## Amendment (2026-10-28, M0 step 11)

The IPC contract is a folder, `src/shared/ipc-contract/` (`#ipc-contract` →
`src/shared/ipc-contract/index.ts`), not a single file. That way it's an architectural element
like the kernel: it may import only kernel types, and lint checks who may import it (`app/`,
`main/`, `preload/`, `ui/`).
