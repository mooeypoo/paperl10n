# M1 plan, part 1: reading documents

Status: **in progress.** Steps R1–R5 below. The other part of M1, choosing languages, is its own
discussion first ([M1-languages](M1-languages.md)).

PRD M1 is "read-only longform": open a project, list its pages with status, and show a static split
view. This part covers reading and showing documents.

## Decided with the maintainer (2026-10-28)

| Topic | Decision | Why |
|---|---|---|
| Parser | **`@lezer/markdown`** behind the `MarkdownParser` port (`document/adapters/`) | CodeMirror 6's own parser: if CodeMirror becomes the M2 editor, the reading view and the editor see the same blocks. Pure, MIT, one small dependency. |
| Pane view | **Markdown, lightly styled**: the text as written, block by block, headings larger, syntax dimmed, code in mono | What the M2 editor will show; no HTML rendering to keep safe; shows bidi problems honestly. A rendered preview comes later as a toggle. |
| Status | **Missing vs. exists only** | "Outdated" waits for its own decision (PRD §11). |
| First real format | **Astro Starlight** (`format-starlight`), the maintainer's live site | PRD M1 named VitePress; the PRD change goes in its own PR for approval. |

## Steps

### R1: the document model and the parser

- Kernel: `TextRange` (UTF-16 offsets, end exclusive).
- `document/domain`: `ParsedDocument` (`text`, `blocks`, `inline`), `findFrontmatter` (YAML `---`
  and TOML `+++`, after an optional BOM), and `parsedDocumentProblems`, the invariants every parse
  satisfies.
- `document/application`: the `MarkdownParser` port. `document/testing`: its contract suite over
  tricky documents (CRLF, BOM, RLM, emoji, frontmatter, containers, MDX, tables, tabs).
- `document/adapters`: `createLezerMarkdownParser()`, with `:::` container fences and MDX
  `import`/`export` lines as their own blocks.
- *Done-notes:*
  - `@lezer/markdown` 1.8.0 and `@lezer/common` 1.5.3, pinned to releases older than two weeks;
    a pnpm override keeps one copy of `@lezer/common` (two copies break lezer's tree classes).
  - Lezer quirks found by the contract suite and handled in the adapter: block ends include the
    CR of CRLF (trimmed); a leading BOM hides the first heading (the body after the BOM or
    frontmatter is parsed on its own, with offsets shifted back); `ranges` reports relative
    positions (not used).
  - Lezer deviations from CommonMark, recorded in the contract and
    [the domain doc](../domains/document.md): a component alone on a line is a paragraph with an
    inline tag (only known HTML block tags make HTML blocks), and `#` followed by a tab isn't a
    heading.
  - Found on the way: literal invisible characters (BOM, RLM) had crept into source files,
    including one from M0. All are `\u` escapes now.
  - Mutation checks: no CR trimming, no BOM skip, no container parser: each fails the contract.

### R2: reading a document pair, and page status

- A use case that reads the selected page's source and translation (the translation may not exist
  yet) and parses both. `listSourceDocuments` reports whether each translation exists.
- IPC: `readDocumentPair({ projectId, key })` → `{ source, target | null }`, each with its text,
  blocks, and inline spans as plain DTOs. Argument validation, error codes, and the end-to-end
  IPC test extend as before.

### R3: the split view

- The panes show each document block by block: headings sized by level, syntax dimmed, inline
  code and code blocks in mono and left-to-right, frontmatter as a quiet block. Each pane keeps
  its own `lang`/`dir`.
- A missing translation says so in its pane. The Pages sidebar marks pages without a translation
  and counts them.

### R4: `format-starlight`

- Layout: `src/content/docs/` (configurable), the source locale as the root or a folder, targets
  in locale folders, `.md` and `.mdx`. Starlight's own config is JavaScript, which a plugin can't
  run, so the locale-to-folder mapping lives in `paperl10n.config.json` options, with sensible
  defaults. Fixtures for root and folder layouts, the plugin contract kit.

### R5: docs

- `docs/domains/document.md` grows with each step; the architecture doc and the README are updated.
  The PRD change (Starlight first) is its own PR.
