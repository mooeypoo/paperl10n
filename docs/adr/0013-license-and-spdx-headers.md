# 0013. License GPL-3.0-or-later and SPDX headers

- Status: accepted
- Date: 2026-10-28

## Context

Paper Lion is free software, licensed **GPL-3.0-or-later**. The license has to be stated
unambiguously for people (README), for tools (package metadata, SPDX), and in each file, because
files get copied out of repositories. Built-in plugins may be extracted into their own packages
later, so per-file and per-package license information should already be correct when that happens.

## Decision

- **`LICENSE`** contains the GPLv3 text from <https://www.gnu.org/licenses/gpl-3.0.txt>, verbatim
  and unmodified. The "or later" option is expressed in the notices, not by editing the license.
- **Package metadata:** every `package.json` has `"license": "GPL-3.0-or-later"` and
  `"author": { "name": "Moriel", "url": "https://moriel.tech" }`. Plugin manifests carry the same
  `license` and `author` fields.
- **README** carries the standard GPL notice and credits Moriel, linking to <https://moriel.tech>.
- **Each source file starts with one SPDX line:**
  - `.ts`, `.js`, `.mjs`: `// SPDX-License-Identifier: GPL-3.0-or-later`
  - `.vue`, `.html`: `<!-- SPDX-License-Identifier: GPL-3.0-or-later -->`
  - `.css`: `/* SPDX-License-Identifier: GPL-3.0-or-later */`
- **Exempt:** fixtures (`tests/fixtures/**`, `src/plugins/*/fixtures/**`), because they stand in for
  users' projects and must stay byte-exact for round-trip tests; JSON files, which have no comment
  syntax; Markdown documentation; and `LICENSE`.
- No per-file copyright line. Authorship lives in the README, the package metadata, and git history.
- A check script (`scripts/check-spdx.ts`, added in M0 step 3) enforces headers as part of
  `pnpm lint`, and adds missing ones with `--fix`.

## Alternatives considered

- **No per-file headers.** Simpler, but files copied out of the repo lose their license.
- **Full [REUSE](https://reuse.software/) compliance** (a copyright line in every file plus the
  `reuse` tool). More churn per file and an extra Python toolchain. We can adopt it later. The SPDX
  lines we add now are already REUSE-compatible.

## Consequences

- Every new source file needs one header line. The check script and `--fix` make this automatic.
- The app should eventually show the license notice in an About screen, since GPLv3 §5(d) asks
  interactive programs to display "Appropriate Legal Notices". That isn't in M0.
- Contribution policy (for example DCO sign-off) is deliberately not decided yet. We revisit it if
  and when outside contributions arrive.
