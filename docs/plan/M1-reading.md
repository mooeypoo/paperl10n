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
- *Done-notes:*
  - `createReadDocumentPair({ sessions, parser })` in `workspace/application`, and `targetExists`
    on `listSourceDocuments` (one `exists` check per page). New error codes
    `workspace.unknown-document` and `workspace.document-unreadable`, with UI messages.
  - The parser is injected into `createAppApi` like the other ports (shared `app/` code is pure
    and can't import adapters); Electron's root and the harness pass the lezer parser.
  - IPC: `readDocumentPair` in the contract, `guardApi`, the preload, main's validator (exactly
    `projectId` and a 1–1,000-character `key`), and the harness transport. The compiler listed
    each place. A test keeps the contract's block and inline kinds equal to the domain's.
  - `FakeMarkdownParser` (`#domain-testing/document`) keeps use-case tests about orchestration;
    it satisfies the same invariants as the real parser, checked over the tricky documents.
  - Mutation checks: a validator that allows extra fields, a stray block kind in the contract,
    and `targetExists` hard-coded: each fails its tests.

### R3: the split view

- The panes show each document block by block: headings sized by level, syntax dimmed, inline
  code and code blocks in mono and left-to-right, frontmatter as a quiet block. Each pane keeps
  its own `lang`/`dir`.
- A missing translation says so in its pane. The Pages sidebar marks pages without a translation
  and counts them.
- *Done-notes:*
  - `useDocumentPair` loads the selected page (newest request wins); `MarkdownView` renders the
    blocks from `segments.ts`, always as text, never as HTML. Pane headers carry the language,
    the path, and the interface's direction; a missing translation and loading say so in the pane;
    a reading error replaces the panes.
  - Sidebar: a filled dot for "has a translation", a hollow one for "not translated yet" (shape,
    not color, carries the difference; the status is also text for screen readers), a legend,
    and "With a translation: 4 of 8". It doesn't claim a file with content is finished.
  - New tokens for dimmed syntax, code surfaces, and link destinations. The mockup's syntax grey
    was 2.6:1; the tokens are ≥4.5:1 on both surfaces in both themes.
  - **Bidi, found in the Chromium screenshots of the sample's Hebrew pages:** inline syntax
    scrambled RTL sentences (`<Badge text="חדש…" />`, link destinations around their
    parentheses), and Hebrew lines in code samples were forced left to right. Now inline code, link
    destinations, and markup with letters (tags, components) are isolated left-to-right runs in
    prose, and code and data blocks use `unicode-bidi: plaintext`, so each line takes its own
    direction. A first attempt isolated code-block contents too and undid the per-line fix; a test
    now pins that down. This is display only: editing (M2) needs the same care in the editor.
  - Mutation checks: no LTR on code blocks, no trailing text run, and isolation inside code blocks
    each fail tests.

### R4: `format-starlight`

- Layout: `src/content/docs/` (configurable), the source locale as the root or a folder, targets
  in locale folders, `.md` and `.mdx`. Starlight's own config is JavaScript, which a plugin can't
  run, so the locale-to-folder mapping lives in `paperl10n.config.json` options, with sensible
  defaults. Fixtures for root and folder layouts, the plugin contract kit.
- *Done-notes:*
  - `src/plugins/format-starlight/` (README, manifest, fixtures), registered in
    `app/plugins.ts`. Options: `contentDir` and `localeFolders` (`""` is the root). Defaults
    follow Starlight's conventions: the source locale's own folder if it exists, else the root;
    targets in lowercase locale folders (`pt-BR` → `pt-br`); at the root, two-letter locale-like
    folders belong to other locales, three-letter ones (`api`) are pages.
  - Translations keep the source's extension (`.mdx` → `.mdx`); `.mdx` files are parsed with MDX
    tolerance (R2).
  - Detection: `certain` with an Astro config that mentions `@astrojs/starlight` and
    `src/content/docs/`, `likely` without the import. With no format pinned, Starlight now wins
    over `format-stub`'s fallback (tested end to end in `createAppApi`).
  - Four fixtures through the plugin contract kit, plus table tests for layouts, options, and
    malformed options (40 tests). The harness opens them too (`?fixture=format-starlight/root-locale`).
  - Found in the harness screenshot of the Starlight fixture: a Hebrew HTML/JSX block
    (`<Card title="…">…</Card>`) was scrambled. Lezer keeps HTML blocks as raw text, so the inline
    isolation didn't apply; HTML blocks now read left to right line by line, like code. **Known
    limit:** two right-to-left runs separated only by neutral characters (`"…">…`) still merge, as
    in code editors. Fixing that needs JSX tokens, with the M2 editor.
  - Dev note: Vitest's cache kept an old expansion of the harness's fixture glob, so new fixture
    folders didn't show up in harness tests until `node_modules/.vitest-cache` was cleared.

### R5: docs

- `docs/domains/document.md` grows with each step; the architecture doc and the README are updated.
  The PRD change (Starlight first) is its own PR.
