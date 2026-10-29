# 0017. One Markdown dialect for the reading model and the editor: `shared/markdown-syntax`

- Status: accepted
- Date: 2026-10-29

## Context

Paper Lion parses Markdown with `@lezer/markdown`, configured for the dialect static sites use:
GFM, `:::` container fences (VitePress, Starlight), and top-level `import`/`export` lines in MDX.
Until M2 that configuration lived in `document/adapters/lezer-markdown-parser.ts`, which runs in
main and feeds the reading view.

M2's editor is CodeMirror 6 (`docs/plan/M2-editing.md`). It re-parses in the renderer as you type,
so it needs the same parser configuration, or the editor and the reading model would disagree
about where a block starts. But the UI may not import adapters (AGENTS.md rules 4 and 7), and
copying the configuration would let the two drift.

The configuration is Lezer setup, not business logic: no domain types, no I/O. Mapping Lezer's
node names to the document model (`Block`, `InlineSpan`) stays the adapter's job.

## Decision

- **A new shared unit, `src/shared/markdown-syntax/`** (alias `#markdown-syntax`), exports
  `markdownSyntax({ mdx, frontmatter })`: the configured `@lezer/markdown` parser, built once per
  combination of options.
- **It imports only `@lezer/markdown` and `@lezer/common`.** No domains, no kernel, no other
  libraries.
- **Only two places import it:** `document`'s adapters (the reading model) and `ui/` (the editor).
  Pure layers and other domains' adapters don't.
- **Frontmatter** is an option. The reading model keeps finding it with `findFrontmatter`
  (`document/domain`) and parses only the body. The editor parses whole files, so the unit also
  has a `Frontmatter` block with the same fence rules, checked against `findFrontmatter` by a test.
  One deliberate difference: a block parser can't look ahead, so an unclosed fence runs to the end
  of the text instead of being ignored. While typing a new frontmatter block, the rest of the file
  shows as frontmatter until it's closed.
- It's type-checked with the pure code (no Node or DOM types) and counts toward the coverage floor.

Enforcement follows ADR 0003: an element in `scripts/eslint/architecture.ts`, a unit in
`scripts/eslint/units.ts` (no relative imports into it), failing samples (it importing a domain,
the kernel, or Vue; a pure layer or workspace's adapters importing it; a relative import into it)
and positive controls (ui and document's adapters importing it, it importing Lezer).

## Alternatives considered

- **The editor imports `#adapters/document/…`:** breaks rule 4 and the adapter boundary, and would
  pull the adapter's model mapping into the renderer.
- **A copy of the configuration in `ui/`:** two dialects that drift, the problem this solves.
- **The editor uses the parse from main (over IPC) instead of parsing:** a round trip per keystroke,
  and CodeMirror's incremental parsing and highlighting are built around a local Lezer parser.
- **Putting it in `shared/kernel`:** the kernel is pure and library-free by design.

## Consequences

- The reading model and the editor parse alike by construction. A dialect change (a new block, a
  new format's syntax) is made once, and the document parser contract tests run over it.
- `shared/` has three units now: the kernel, the IPC contract, and the Markdown syntax.
- If a format plugin one day needs its own syntax extensions, they'd be added through this unit's
  options, not by plugins importing it (plugins only see `#plugin-api`).
