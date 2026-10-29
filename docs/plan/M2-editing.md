# M2 discussion: editing and saving longform

Status: **decided (2026-10-29), starting with the spike (E0).** See [Decided](#decided). The
discussion follows, for context.

PRD M2: "Edit and save longform. Seed from source, edit the target, and save with round-trip
safety." PRD §11 asks for the editor decision before M2 starts.

## Decided

| Topic | Decision |
|---|---|
| Editor (PRD §11) | **CodeMirror 6, spike first.** Markdown stays the document, so the round-trip guarantee holds by construction; visual editing grows later as live-preview decorations. The E0 spike over bidi samples confirms it before E2; if CodeMirror fails it, we come back to ProseMirror/Tiptap. |
| Dependencies | **Approved:** `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown` (all MIT). |
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
- **E1, writing more:** `ProjectWriter` creates missing folders. A `saveDocument` use case writes a
  target file atomically, after checking that the file on disk is still what was read.
- **E2, the editor:** a target pane editor (CodeMirror behind a UI component, Markdown
  decorations from the same Lezer parser, the bidi rules), and a read-only source pane.
- **E3, seed and save:** "Start translating", Save (button, Ctrl/Cmd+S), dirty state in the page
  list, and the unsaved-changes guard.
- **E4, drafts:** a `DraftStore` port (in app data), autosave of drafts, and restore on reopen.
- **E5, external changes:** the conflict flow on save.
- **E6, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

Round-trip tests throughout: open, edit nothing, save → the file is unchanged byte for byte; an
edit changes only the edited characters.
