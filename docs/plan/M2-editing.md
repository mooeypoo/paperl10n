# M2 discussion: editing and saving longform

Status: **done (2026-10-29): E0–E6.** See [Decided](#decided). The
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
  - *E3 done-notes:*
    - **Start translating:** a page without a translation offers "Start translating", which
      opens the editor on a byte-for-byte copy of the source, unsaved, with a note that saving
      creates the file. Nothing is written until Save. (The copy's prose takes the pane's direction,
      so English sits right-aligned in a Hebrew pane until it's translated.)
    - **Save:** a button in the translation pane's header and Ctrl+S / Cmd+S from anywhere in the
      window. The shortcut matches the physical key (`code`), so it works on a Hebrew layout,
      where `key` is "ד". The save sends `base`: the file as read, the last save, or `null` for a
      new translation (E1's conflict check). A status (`role="status"`) says unsaved, saving, or
      saved. A failure shows its message in the pane and keeps the changes unsaved.
    - **Dirty state** lives in the editor (`save-point.ts`): the document differs from the last
      saved one, so undoing back to the saved text is clean again. A save marks the snapshot it
      sent, so typing during a save stays unsaved. The page list marks the page (an accent dot,
      a screen-reader label, and a legend entry while it applies). After a first save, the page
      counts as translated and stays selected (`usePages` keeps the selection when the same
      project's list changes).
    - **The guard:** switching pages, opening another project, changing the target language,
      or closing the window with unsaved changes asks "Save your changes?" (Save, Don't save,
      Cancel; Escape cancels). If Save fails, the page stays open with the error. Closing uses
      the renderer only: `beforeunload` cancels the close and asks, and "Don't save" closes the
      window with `window.close()`. No main-process dialog, so the question is in the interface
      language. The e2e tests check it in a real window. They now destroy windows in `afterEach`, so
      a test that leaves unsaved changes can't hold the app open.
    - Mutation checks, each failing tests: the close not held back, Ctrl+S matched by `key` only,
      the guard never asking, Cancel leaving anyway, no `base` sent, the snapshot not marked
      saved, the page not marked translated, the selection reset by the save, a new translation
      starting clean, and dirty checked by identity (so undo would stay dirty).
- **E4, drafts:** a `DraftStore` port (in app data), autosave of drafts, and restore on reopen.
  In two PRs: E4a (the store, use cases, and IPC) and E4b (autosave and restore in the UI).
  - *E4a done-notes:* a `DraftStore` port in `workspace` (not `translation`, as the architecture
    sketch had it: every use case that needs drafts is workspace's, so no new domain edge).
    `nodeDraftStore` keeps one JSON file per draft in `userData/drafts/` (named by a SHA-256 of
    the key, atomic writes, `0700`/`0600`); `InMemoryDraftStore` serves tests and the harness.
    Both pass `describeDraftStoreContract`.
    - **Keys:** the project's `location` (new on `OpenedFolder`/`OpenedProject`: the real folder
      path, so a link to the folder shares its drafts; main-process only), the target locale, and
      the page key.
    - **Use cases:** `saveDraft` and `discardDraft` (IPC methods of the same name). The key only
      has to be well formed, so autosave never reads the project. `readDocumentPair` returns the
      page's `draft` and forgets one that matches the file. `listSourceDocuments` returns
      `hasDraft`. `saveDocument` forgets the draft once the file holds the text, and keeps it when
      saving fails. Draft reads and listings that fail count as no draft, so pages still open.
    - **Errors:** `workspace.draft-unwritable` (with a message that says the edits are still in
      the editor).
    - Tests include an IPC end-to-end "restart" (a new app session over the same drafts folder).
      The new invisible-character lint rule caught a literal BOM in the contract suite on its first
      day.
    - Mutation checks, each failing tests: a draft matching the file kept, the draft kept after a
      save, the draft dropped on a conflict, drafts not listed, drafts keyed by the folder's name,
      the key not validated, a hash collision not checked, stray copies listed, and main not
      checking `discardDraft`'s key.
  - *E4b done-notes:*
    - **Autosave:** each edit (a new `change` event from the editor) schedules a draft about 0.8 s
      after typing pauses. Edits undone back to the saved text forget the draft instead. A failure
      shows `workspace.draft-unwritable` in the pane (the edits are still in the editor) and clears
      once keeping works again.
    - **Restore:** a page that comes with a draft opens on the draft's text, unsaved, with its
      `base` (so saving checks the file against what the draft started from, and a file changed
      since is refused: E5's case). A note says the changes were restored, with "Discard them",
      which forgets the draft and returns the editor to the file. The note goes once the page is
      saved.
    - **Leaving:** "Don't save" in the unsaved-changes question (pages, projects, language, closing
      the window) forgets the draft. Saving forgets it in main (E4a).
    - **Page list:** pages with drafts get the unsaved marker (and its screen-reader label), so
      after a restart it's clear which pages to come back to. A save or a discard clears it.
    - **A race the mutation checks found:** cancelling the pending draft when a save succeeds would
      also have dropped the draft for text typed *during* the save. Now a save only marks the draft
      as forgotten. The pending draft then keeps the newer text, or does nothing if all is saved.
      This has its own test.
    - **E2E:** type, wait for the draft file in the profile's `drafts/`, kill the app with
      SIGKILL (a real crash), relaunch with the same profile: the page is marked, opens with the
      draft and the note, the project file is untouched, and Ctrl+S writes it and removes the
      draft file.
    - Mutation checks, each failing tests: no autosave, the draft's base ignored, a save cancelling
      the pending draft, discarding a restored draft keeping its base, "Don't save" keeping the
      draft, a restored draft starting clean, drafts not marked in the list, and a saved page
      keeping its draft marker.
- **Fix, found while checking E5 in Hebrew:** changing the interface language threw away unsaved
  edits. The editor started over whenever its accessible label changed, and the label is in the
  interface's language. Starting over also made the page clean, so the draft was dropped too. Now
  only a new file (or MDX or read-only changing) starts over. The label, `lang`, and `dir` sit in
  a CodeMirror compartment that is swapped in place, keeping the text and its undo history.
  Mutation checks: the label restarting the editor, and the compartment never reconfigured.
- **E5, external changes:** the conflict flow on save. ✅ Done (UI only: no contract change).
    - **The question:** when a save is refused with `workspace.document-changed` (git pull, another
      editor, a deleted file, a draft restored over a file that changed since), an alert dialog
      names the file and offers **Keep editing** (the default, also Escape), **Reload from disk**,
      or **Overwrite with mine** (styled as a destructive action).
    - **Keep editing:** the edits stay unsaved and the error stays in the pane; the next save asks
      again if the file is still different.
    - **Reload from disk:** forgets the page's draft and reads the page again. The editor shows the
      file as it is (or "Start translating" if it was deleted), clean.
    - **Overwrite with mine:** reads the page again and saves with the file's current text as the
      base (`null` if it was deleted). Main's check still applies, so a change made in between asks
      again. A failed read shows its error and saves nothing.
    - **Restored drafts:** when a draft's base is no longer the file, the restored note says so up
      front: "The file has changed on disk since, so saving will ask which version to keep."
    - **Leaving and closing:** saving from the unsaved-changes question into a conflict stays on the
      page with the conflict question. While it's open, Ctrl+S does nothing, and closing the window
      or leaving waits for its answer instead of asking a second question.
    - **E2E:** edit, change the file from outside, Ctrl+S: the question shows and the file is
      untouched. Reload shows theirs; edit again, change it again, Overwrite: the file holds
      theirs plus mine.
    - Mutation checks, each failing tests: never asking, asking for every failure, overwriting
      against the old base, saving after a failed read, the conflict surviving a new read, reload
      keeping the draft or not reading again, leaving or Ctrl+S during the question, no default
      focus, Escape ignored, and the restored note's warning missing or always shown.
- **E5b, link preview (from testing on a real site):** editing a right-to-left sentence with a
  raw `[text](url)` in it was hard: the URL is a long left-to-right run in the middle of the
  prose. The first live-preview decorations (as planned in the editor decision above), links only.
  ✅ Done.
  - `ui/editor/markdown-links.ts`: away from the caret, an inline link shows as its text
    (underlined) and a small link chip at its logical end; `[`, `](url "title")` are hidden. The
    chip's tooltip is the URL and its accessible name is "Link to $1" (the URL isolated), from
    the interface's language through a facet, so changing the language relabels it.
  - A caret or selection touching the link (its edges included) shows its Markdown again.
    Clicking the chip puts the caret there, so it reveals the link too. An editor without focus
    shows every link as a preview.
  - Reference links, autolinks, images, and links with empty text stay as written.
  - Its own view plugin, rebuilt on selection changes; the styles and bidi isolates
    (`markdown-decorations.ts`) don't rebuild when the caret moves.
  - Tests: which links get a preview (table), when a link is revealed (table), the rendered text
    and chip label in the component, and an E2E in Electron: in a Hebrew sentence the chip sits to
    the left of the link text, clicking it reveals the Markdown, and moving away hides it again.
    (Focus and selection can't be driven in happy-dom: it fires `selectionchange` synchronously.)
- **E5c, the link dialog:** editing a link as two fields instead of Markdown. ✅ Done.
  - Clicking a link's chip in the translation, or Ctrl/Cmd+K with the caret in a link, opens
    **Edit link**: the text (in the pane's language and direction) and the target (always left to
    right, monospace), with **Update link**, **Cancel** (also Escape), and **Remove link** (keeps
    the text). Ctrl/Cmd+K elsewhere opens **Add link** for the selected text (on one line) or at
    the caret; without text, the target is the text.
  - A modal `<dialog>` like the app's other questions, not a popover anchored to the chip: focus
    is trapped and returns to the editor for free. An anchored popover can come later.
  - The dialog is interface text: it takes the interface's language and direction, not the
    pane's, though it sits in the pane. Only the read-only source has none (its chips reveal the
    link, as before).
  - Applying changes only what changed (`ui/editor/link-editing.ts`): a title, spacing, and an
    untouched text or target stay as written. A target with spaces or unbalanced parentheses is
    written in `<` `>`; brackets in the text are escaped unless they pair up. If the text changed
    under the dialog (another file loaded), the answer does nothing.
  - The editor stays Vue-free: it hands the UI a `LinkEdit` request, answered by apply, remove, or
    cancel.
  - Tests: table tests for writing targets and text, finding the link at a position, and the
    changes; the command and chip click in an editor; the dialog through the whole UI (fields and
    their directions, apply, Escape, Cancel, remove, no target); and the E2E in Electron (focus in
    the target field, Enter applies, typing afterwards lands in the editor, Ctrl+K adds a link).
- **E5d, hiding the other marks:** the live preview grows past links. ✅ Done.
  - Away from the caret, `**`/`__`, `*`/`_`, `~~`, inline code's backticks, and an ATX heading's
    `#`s (with the space after them, and closing `#`s) are hidden (`ui/editor/markdown-marks.ts`).
    The caret or a selection touching the element shows them: anywhere on a heading's line, or in
    the emphasis or code span.
  - Kept as written: list markers, quotes, table pipes, code fences, Setext underlines, HTML and
    components, escapes, and anything in code blocks or frontmatter. A heading with no text keeps
    its `#`.
  - Bold, italic, and struck text are styled with their marks (`markdown-decorations.ts`), so text
    looks the same whether its marks show or not.
  - One view plugin for the whole live preview (`ui/editor/live-preview.ts`, links included),
    rebuilt as the caret moves; the styles and bidi isolates still don't rebuild then.
  - Inline code keeps its left-to-right isolation with the backticks hidden: the E2E checks a
    command reads in order inside a Hebrew sentence.
  - Tests: what's hidden for each element (table, including what must stay), the reveal rule, the
    preview of an unfocused editor, and the E2E (heading mark shown on its line and hidden again,
    bold's look, code order).
- **E6, docs and the PRD:** the decisions into the PRD (its own PR, for approval).
    - §6: a glossary entry for a **draft** (unsaved edits), told apart from the `draft` status.
    - §7.2: both panes are CodeMirror editors; seeding is a copy written on first save;
      frontmatter is edited as text for now; the bidi rules; visual editing as decorations.
    - §7.4: explicit save and Ctrl/Cmd+S, drafts in app data, the leave question, no-op saves,
      and external changes checked on save (watching later).
    - §10: M2 marked done. §11: the visual-editing question marked decided; sidecar state
      narrowed to status.
    - A follow-up brought in what E5b–E5d built after it was written: §7.2's visual editing
      describes the live preview as it is (links with a chip and a dialog, hidden marks), the
      bidi rules name the line-by-line blocks and isolated runs, and §7.4 the bytes a round trip
      keeps. §10 mentions the live preview; §11's components question covers images too.

Round-trip tests throughout: open, edit nothing, save → the file is unchanged byte for byte; an
edit changes only the edited characters.
