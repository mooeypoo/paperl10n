# M2 discussion: editing and saving longform

Status: **decided (2026-10-29); E0 (spike), E1 (saving), and E2 (the editor) done, E3 (seed and save) next.** See [Decided](#decided). The
discussion follows, for context.

PRD M2: "Edit and save longform. Seed from source, edit the target, and save with round-trip
safety." PRD §11 asks for the editor decision before M2 starts.

## Decided

| Topic | Decision |
|---|---|
| Editor (PRD §11) | **CodeMirror 6, spike first.** Markdown stays the document, so the round-trip guarantee holds by construction; visual editing grows later as live-preview decorations. The E0 spike over bidi samples confirms it before E2; if CodeMirror fails it, we come back to ProseMirror/Tiptap. |
| Dependencies | **Approved:** `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown` (all MIT). After the spike, E2 uses the first four only: the Markdown language is built from our own `@lezer/markdown` parser (see E0). |
| Saving | **Explicit save, plus drafts in app data.** Ctrl/Cmd+S and Save write the file atomically. Unsaved edits are kept as drafts in the app's data folder (never in the project) and restored after a crash or restart. |
| Seeding | **On first save.** "Start translating" opens a byte-for-byte copy of the source as unsaved; the file (and any missing folders) is written on save. |

Taken as recommended unless the maintainer says otherwise: the whole target file is editable as
text (frontmatter included); the source pane is a read-only CodeMirror; external changes are
checked on save (file watching later); prose lines take the pane's direction, code and frontmatter
lines are LTR, and inline syntax is isolated.

## Where M1 left us

- The panes show each file's Markdown as written, block by block, lightly styled, read-only.
- The parser is `@lezer/markdown` (CodeMirror 6's own), chosen so the reading view and an M2
  editor would see the same blocks.
- Writing exists: an atomic `ProjectWriter` (temporary file + rename) and a byte-preserving config
  edit. It writes only into folders that already exist.
- The UI/UX plan already says "editing (CodeMirror spike first)".

## Questions to decide

### 1. The editor (PRD §11)

| Option | Round trip | Bidi | Custom components (MDX, `:::`) | Visual editing later |
|---|---|---|---|---|
| **A. CodeMirror 6**, a Markdown source editor with decorations | **Safe by construction:** the file's text is the document. An edit changes only the characters typed. | Per-line direction and bidi-isolated ranges are built in (to confirm in a spike). Caret motion follows the bidi order. | Plain text, so never lost. Decorations can dim or chip them. | Grows by **live-preview decorations** (as Obsidian does on CodeMirror 6): syntax hidden or dimmed off the caret line, links shown as chips inserted with controls. Markdown stays the single source of truth. |
| **B. ProseMirror / Tiptap**, rich text serialized to Markdown | **Hard:** the file is parsed into a model and written back out. Serializers normalize `*`/`_`, list markers, escaping, and blank lines, so an untouched paragraph can change. Meeting PRD §7.4 needs a diff-and-patch layer on top. | Native `contenteditable` bidi; links as marks, so no raw `[text](url)` in the sentence. | Each needs a custom node, or it's lost or escaped. | Visual from day one. |
| **C. Milkdown** (ProseMirror + remark) | Same as B. | Same as B. | remark plugins help, but the same normalization applies. | Same as B. |

**Recommendation: A, CodeMirror 6.** The round-trip guarantee is the PRD's hardest promise, and
A keeps it by construction. A also shares its parser with the reading view, and it can grow
toward visual editing, with link controls and isolated link targets, without changing the file
model. B's strength (visual editing from day one) is what PRD §7.2 plans for *after* M2.

**Spike first (E0):** a throwaway editor over Hebrew and Arabic samples with links, inline code,
code blocks, and JSX. Check caret movement and selection across direction changes, typing at a
direction boundary, IME input, screen reader behavior, and the cost of bidi isolation. The spike
decides; if CodeMirror fails it, we come back to B.

**New dependencies** (need approval): `@codemirror/state`, `@codemirror/view`,
`@codemirror/commands` (undo, keys), `@codemirror/language` and `@codemirror/lang-markdown` (the
Lezer parser we already use). All MIT.

### 2. What is editable in M2

| Option | Notes |
|---|---|
| **The whole target file, as text** (recommended) | Frontmatter included, as raw text. Simple, and safe with A. Sections arrive in M3. |
| Only the body, frontmatter locked | Avoids broken frontmatter, but hides keys that need translating (`title`, `description`). |
| Frontmatter as fields | The future brainstorm topic ([follow-ups](follow-ups.md)); needs plugin rules. |

The source pane stays read-only: the same view as now, or a read-only CodeMirror for the same
look. Recommendation: a read-only CodeMirror, so both panes behave alike (selection, search).

### 3. Seed from source

When a page has no translation yet, "Start translating" creates the target file.

- **Content:** a byte-for-byte copy of the source (frontmatter, code, links, and components
  kept; the prose ready to overwrite). Recommended: plain copy in M2; smarter seeding (for example
  blanking prose) is a later option.
- **Folders:** the target folder may not exist yet (a new language). Seeding creates missing
  folders inside the project. `ProjectWriter` gains folder creation, under the same symlink and
  inside-the-project checks.
- **When it's written:** right away (the file exists, status becomes "started"), or only on the
  first save. Recommended: on first save. Seeding opens the copy in the editor as unsaved, so
  looking at a page never creates files.

### 4. Saving and drafts (PRD §7.4)

| Option | Notes |
|---|---|
| **Explicit save, plus drafts in app data** (recommended) | Ctrl/Cmd+S and a Save button write the file atomically. Unsaved edits also go to a draft store in the app's data folder (per project and file), restored after a crash or restart. Files in the project change only on save, so git sees nothing until you save. |
| Explicit save only | Simplest; losing a crash's worth of work is the risk. |
| Autosave to the file | No save step, but every pause writes the project, and git always shows churn. |

Also: a "you have unsaved changes" guard when switching pages, opening another project, or
closing the window. Where drafts live is a PRD §11 question ("Sidecar state"); this answers it
for drafts only, in app data, never in the project.

### 5. External changes (PRD §7.4)

| Option | Notes |
|---|---|
| **Check on save** (recommended for M2) | Remember what was read (its text, or a hash). Before writing, read again; if it changed on disk, don't overwrite: offer "reload theirs" or "keep mine". Cheap, no watcher. |
| Watch files | Offers a reload as soon as git pull or another editor changes a file. Needs a file watcher port in main; better after M2. |

### 6. Bidi in the editor

- Each line's direction: the pane's direction, or each line by its first strong character
  (`dir="auto"` per line, CodeMirror's per-line direction).
- Code blocks and frontmatter lines: left to right, as the reading view does now.
- Inline code, URLs, and markup: isolated runs, as the reading view does now.

Recommendation: the pane's direction for prose lines, LTR for code and frontmatter, isolated
inline syntax. The spike confirms it.

## Proposed steps (after the decisions)

- **E0, the spike:** CodeMirror over the bidi samples; findings recorded here. Throwaway code.
  - *Done-notes (2026-10-29):* **CodeMirror 6 passes; E2 goes ahead with it.** The spike ran
    two editors side by side in Electron (offscreen, sandboxed) over a Hebrew/Arabic page with
    frontmatter, links, inline code, a code block, `:::` containers, inline JSX, and a JSX block.
    One editor used the proposed bidi rules; the other used none. CodeMirror 6.43 has the APIs
    needed: `EditorView.perLineTextDirection`, `EditorView.bidiIsolatedRanges`, and
    `bidiIsolate` on mark decorations.
  - **Caret and typing:** walking a mixed Hebrew/Arabic line with the arrow keys reached every
    position, never stalled, and behaved the same with and without isolation (CodeMirror moves
    the caret in visual order). Hebrew typed right after a link's `)` landed after it in the
    text.
  - **What to isolate (same rule as the reading view):** only syntax that contains letters:
    inline code, URLs, and HTML/JSX tags, each as one LTR run. Isolating bracket marks (`[`,
    `]`, `(`, `)`) one by one *broke* them: RTL text no longer mirrors them, so `[המדריך]`
    showed as `]המדריך[`. With the narrow rule, `[המדריך](https://…)`, `[…](./config.ts)` and
    `<Badge text="חדש" />` all read correctly (the tag's characters measured left to right in
    order; without isolation they're scrambled).
  - **Per-line direction:** code blocks, frontmatter, and HTML/JSX blocks as LTR lines (line
    decorations with `dir="ltr"` plus `perLineTextDirection`) read correctly. Without them, code
    showed as `;export default greeting`. Still to decide in E2: `:::tip[…]` container fence
    lines (RTL now, with the marker at the far end).
  - **Cost:** on a 5,279-line document, a keystroke renders within one frame (16.7 ms median and
    p95) with or without isolation. Production code should build decorations for the visible
    ranges only (the spike walked the whole tree).
  - **Bundle:** state + view + commands ≈ 95 KB gzipped. A Markdown language over our own
    `@lezer/markdown` parser adds ≈ 12 KB (a parser the app already ships). `markdown()` from
    `@codemirror/lang-markdown` adds ≈ 77 KB more, because it nests the HTML, CSS, and JavaScript
    languages for highlighting. **So E2 drops `lang-markdown`** and builds the language from our
    parser with `@codemirror/language`: four packages instead of five, and the editor and the
    reading view parse alike.
  - **For E2 to settle:** the renderer re-parses as you type, so it needs the same Lezer parser
    setup (container fences, MDX lines) as `document/adapters`. The UI can't import adapters, so
    the shared setup needs a home (probably a small ADR).
  - **Not checked here (needs a person at a real keyboard):** IME composition, a screen reader
    (Orca on Linux), and how typing at direction boundaries feels. To do on the E2 build.
- **E1, writing more:** `ProjectWriter` creates missing folders. A `saveDocument` use case writes a
  target file atomically, after checking that the file on disk is still what was read.
  - *Done-notes:* `ProjectWriter.writeText` takes `{ createFolders }`. `nodeProjectWriter`
    creates folders one at a time, checking that each is a real folder inside the project, so a
    symlinked folder can't lead outside. `InMemoryProjectFiles` matches, and both pass the
    contract's new cases. `saveDocument` (workspace use case, IPC method of the same name) writes
    a page's translation exactly as given, creates missing folders, writes nothing when the text
    already matches the file (`written: false`), and refuses (`workspace.document-changed`) when
    the file on disk isn't what editing started from (`base`, or `null` for a new translation).
    New errors: `workspace.document-changed`, `workspace.document-unwritable`. Main bounds the
    text at 10 million UTF-16 code units. No UI yet (E3).
  - **For E2:** CodeMirror normalizes line breaks by default (a CRLF file would come back with
    LF). The editor must keep the file's own line separator (`EditorState.lineSeparator`, set
    from the file), and round-trip tests must cover CRLF, mixed endings, a BOM, and a missing
    final newline.
  - Mutation checks: saving without the conflict check, writing unchanged text, saving without
    folder creation, folder creation following a link out of the project, the in-memory writer
    making a folder over a file, and main ignoring `base`: each fails tests.
- **E2, the editor:** a target pane editor (CodeMirror behind a UI component, Markdown
  decorations from the same Lezer parser, the bidi rules), and a read-only source pane. In two
  PRs: E2a (the shared parser setup) and E2b (the editor).
  - *E2a done-notes:* the Lezer configuration (GFM, `:::` container fences, MDX `import`/`export`)
    moved from `document/adapters` to a new shared unit, `src/shared/markdown-syntax/`
    (`#markdown-syntax`, [ADR 0017](../adr/0017-shared-markdown-syntax.md)), which only
    `document`'s adapters and `ui/` may import, and which imports only Lezer. For the editor, which
    parses whole files, it also has an optional `Frontmatter` block with `findFrontmatter`'s fence
    rules (a test checks they agree), except that an unclosed fence runs to the end of the text.
    The reading model is unchanged (its contract tests pass as before). Lint has an element and
    unit for it, with failing samples and positive controls. Mutation checks: the UI not allowed,
    every domain's adapters allowed, the unit allowed the kernel or any library, frontmatter found
    past the first line, and the closing fence not consumed: each fails tests.
  - *E2b done-notes:* both panes are CodeMirror 6 editors (`ui/editor/`, mounted by
    `MarkdownEditor.vue`): the source read-only (focusable and selectable, `aria-readonly`), the
    translation editable, each with the pane's `lang`/`dir` and the pane heading as its accessible
    name. The M1 reading view (`MarkdownView`, `segments.ts`) is gone; its rules carry over:
    - **Language:** built from `#markdown-syntax` with frontmatter (no `lang-markdown`). The IPC
      `DocumentTextDto` gained `mdx`, so `.mdx` files parse the same way in both processes.
    - **Bidi (`markdown-decorations.ts`, visible range only):** code, frontmatter, MDX
      `import`/`export`, HTML blocks, tables, and `:::` container fences read line by line
      (`dir="auto"` per line plus `perLineTextDirection`). **The fence-line question from E0 is
      settled this way:** `:::tip[טיפ]` reads as written, marker first. In prose, inline code,
      URLs, and markup with letters (tags, components, `[x]`) are isolated LTR runs; bare
      punctuation isn't.
    - **The file's bytes (`file-text.ts`):** the editor never shows a BOM, so it can't be deleted
      by accident. A state field remembers the BOM, the file's usual line ending, and each line
      that ends differently (as points that follow edits). Lines added in the editor take the usual
      ending. Undoing an edit that deleted an unusual ending brings it back (history's
      `invertedEffects`). Tested: untouched files (CRLF, CR, mixed, BOM, no final newline) come back
      byte for byte, and a seeded random test compares edits with the same edits made to the raw
      file.
    - **The strict CSP holds:** CodeMirror's injected base theme would be a `<style>` element,
      which `style-src 'self'` blocks (the first e2e run caught it). The editor lives in a shadow
      root, where CodeMirror uses a constructed stylesheet instead; the editor's own styles
      (`markdown-editor.css`) join it there. No `'unsafe-inline'`, no nonce (ADR 0010 amendment). A
      new e2e test types Hebrew into the translation, checks the source can't change, and checks
      CodeMirror's styles applied, with no CSP violations or console errors.
    - **A new lint check:** `no-irregular-whitespace` now covers strings, templates, regular
      expressions, and comments. Literal BOMs had slipped into source twice (fixed here, in
      `config-edit` and `markdown-syntax` too). Samples in
      `tests/architecture/invisible-characters.test.ts`; turning off each of the four options
      fails them.
    - Mutation checks, each failing tests: unusual endings ignored, BOM dropped, the ending placed
      before typed text, undo losing endings, punctuation isolated, isolation inside code blocks,
      no per-line direction, and the source editable. One mutation survived and taught something:
      removing our `aria-readonly` changed nothing, because CodeMirror sets it for read-only
      states; the redundant line was removed.
    - Edits live only in the editor until E3 adds saving. Still for the maintainer, on a real
      keyboard: IME, Orca, and how typing at direction boundaries feels
      ([follow-ups](follow-ups.md)).
- **E3, seed and save:** "Start translating", Save (button, Ctrl/Cmd+S), dirty state in the page
  list, and the unsaved-changes guard.
- **E4, drafts:** a `DraftStore` port (in app data), autosave of drafts, and restore on reopen.
- **E5, external changes:** the conflict flow on save.
- **E6, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

Round-trip tests throughout: open, edit nothing, save → the file is unchanged byte for byte; an
edit changes only the edited characters.
