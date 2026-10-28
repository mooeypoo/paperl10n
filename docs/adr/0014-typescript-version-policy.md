# 0014. TypeScript version policy: 6.0 now, 7-ready, switch on a clear trigger

- Status: accepted
- Date: 2026-10-28
- Revisit when: the trigger below is met (Dependabot PRs for `typescript-eslint` or `vue-tsc` are
  the usual signal).

## Context

TypeScript 7.0 (the native Go compiler) is `latest` on npm. It's much faster and keeps the same
language. But two tools we depend on don't support it yet:

- **`typescript-eslint`** (type-aware lint rules such as `no-floating-promises` and
  `switch-exhaustiveness-check`) declares `typescript: ">=4.8.4 <6.1.0"`. Those rules matter for our
  errors-as-values convention (ADR 0007): they catch an unhandled promise or a `Result` you forgot
  to check.
- **`vue-tsc`** (type-checking `.vue` templates) and the Vue editor tooling build on the
  JavaScript compiler API, which 7.0 replaces.

TypeScript 6.0 is the last JavaScript-based release and was designed as the bridge: its
deprecations line up with 7.0, so code that's clean on 6.0 moves to 7.0 unchanged. When this was
decided (M0 step 2), the project built cleanly under both 6.0.3 and 7.0.2.

## Decision

1. **The project's compiler is `typescript@~6.0`.** `@types/node` follows the Node major in
   `.nvmrc` (currently `^24`).
2. **Stay 7-ready:** no options that 7.0 removes (`baseUrl`, `moduleResolution: node`/`node10`,
   `target: ES5`, `outFile`, `importsNotUsedAsValues`, …). `erasableSyntaxOnly` is on, so there are
   no enums, namespaces, or parameter properties, which also lets Node run our `.ts` scripts
   directly.
3. **CI runs a forward-compatibility job** (`ts7-preview`, added in M0 step 4) that type-checks
   every plain-TypeScript project with a pinned TypeScript 7 through `pnpm dlx` (no project
   dependency). It doesn't block merges, but a failure is a bug to fix promptly. `.vue` files are
   out of its scope until `vue-tsc` supports 7.
4. **Trigger to switch:** *both* `typescript-eslint` and `vue-tsc` declare support for TypeScript 7
   in a stable release. Then:
   - bump `typescript` to 7.x and remove the `ts7-preview` job,
   - run `pnpm check` and `pnpm test:e2e`, and confirm type-aware lint rules still report (the
     architecture tests in `tests/architecture/` include samples for them),
   - confirm editor support (Vue language tools) works with 7,
   - mark this ADR `superseded by NNNN` in the ADR that records the switch.

## Alternatives considered

- **TypeScript 7 now.** It means dropping type-aware linting and `.vue` template checking. The
  speed gain doesn't matter at our size (a full check takes under a second on 6.0).
- **TypeScript 7 for `typecheck`, 6.0 for tooling, both installed.** Two compilers in
  `package.json` (one under an alias), and the confusing question of which one is "right". The
  non-blocking CI job gives the same early warning without that.

## Consequences

- We may run one major version behind `latest` for a while. Dependabot will keep proposing 7.x
  for `typescript`. Those PRs are declined (or ignored in the Dependabot config) until the trigger
  is met.
- Drift from 7.0 is caught by CI as it happens, so the eventual switch should be a version bump.
