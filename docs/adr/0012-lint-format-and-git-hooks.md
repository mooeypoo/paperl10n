# 0012. Lint, format, and git hooks without hook managers

- Status: accepted
- Date: 2026-10-28

## Context

One maintainer, plus coding agents, need fast feedback that's identical locally and in CI. Every
tool is a dependency to keep updated, so the toolchain should stay small and boring. `AGENTS.md`
requires lint to run in CI and on pre-commit.

## Decision

- **ESLint (flat config, `eslint.config.js`)** with `@eslint/js` recommended and
  `typescript-eslint`'s **`strictTypeChecked`** preset, using the project service, so rules see real
  types (`no-floating-promises`, `no-explicit-any`, `require-await`, …). Additions:
  `switch-exhaustiveness-check` (error codes are unions, ADR 0007), `eqeqeq`, and reporting unused
  `eslint-disable` comments. Plain `.js` config files get the non-type-checked rules.
  Architecture rules (boundaries) join this config in M0 step 5, and Vue rules in step 13.
- **Prettier** owns formatting (`singleQuote`, `printWidth: 100`). `eslint-config-prettier` turns
  off overlapping lint rules. **Markdown is excluded**: docs are written by hand, and Prettier would
  re-pad every table on each edit, which makes doc diffs noisy. Fixtures, the lockfile, and
  `LICENSE` are excluded too.
- **Repo scripts are TypeScript run directly by Node 24** (`node scripts/check-spdx.ts`, using Node's
  built-in type stripping). They're type-checked in `tsconfig.node.json` and unit-tested like
  everything else. `erasableSyntaxOnly` (ADR 0014) guarantees Node can run them.
- **Git hooks are plain shell scripts in `.githooks/`.** `pnpm install` runs `prepare`, which sets
  `git config core.hooksPath .githooks`. `pre-commit` runs `pnpm lint` (SPDX + cached ESLint),
  `pnpm format:check`, and `pnpm typecheck` (incremental). Tests run in CI, to keep commits fast.
  The hook checks the working tree, not just the staged content. That's simpler, and stricter rather
  than looser.
- **`pnpm check`** is the one command meaning "green" (typecheck, lint, format, test). CI runs the
  same steps individually, so a failure names the step.
- **The SPDX check runs before ESLint** in both `lint` and `lint:fix`, so `lint:fix` adds missing
  headers even when ESLint has unrelated errors.

## Alternatives considered

- **Biome** (one fast tool for lint and format): it can't express our architecture boundary rules,
  and its Vue support is partial.
- **husky + lint-staged**: two dependencies for what `core.hooksPath` does natively. Linting only
  staged files is unnecessary at this size, since ESLint's cache keeps a full run fast.
- **ESLint stylistic rules instead of Prettier**: more configuration to maintain for the same
  result.

## Consequences

- `git commit --no-verify` can skip the hook. CI is the real gate.
- New contributors get hooks automatically on `pnpm install`. Running `git config --unset
  core.hooksPath` disables them.
- Type-aware linting needs every linted `.ts` file to belong to a tsconfig project. A new top-level
  folder needs a tsconfig `include` entry, which is the same discipline the boundaries rules
  require.
