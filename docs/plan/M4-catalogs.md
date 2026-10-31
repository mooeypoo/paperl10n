# M4 discussion: banana-i18n catalogs

Status: **open for discussion.** Questions first, each with a recommendation; steps follow once
they're decided.

PRD M4: "banana-i18n. Catalog list, split message editor, `qqq` docs, and validation." PRD §7.3
lists what the catalog editor does: a list of messages (key · source · target · status, with search
and filters), a focused editor for one message with its `qqq` documentation, inline warnings for
placeholders, `{{PLURAL:…}}`, `{{GENDER:…}}`, and links, `@metadata`, formatting, and key order
kept on save, and keys missing from the target or no longer in the source. The UI/UX plan's
direction C ("Catalog") and its banana-i18n helpers (highlighting, warnings, plural and gender
previews, placeholder autocomplete) say how it looks.

## Where M3 left us

- **Catalogs exist only as a sketch.** `catalog` has a `Message` type and nothing else.
  `CatalogFormat` in `formats` (`detect`, `open` → `listCatalogs` and `catalogPathFor`, `parse`,
  `serialize` as patches, and `placeholders.scan`) has never been implemented. The manifest and the
  registry already accept catalog plugins.
- **A project needs a document format.** `openProject` fails with `workspace.no-document-format`
  when no document plugin detects the folder. The config can pin `documentFormat`, but has no
  catalog counterpart.
- **What longform built that catalogs can reuse:**
  - the atomic `ProjectWriter`, and a byte-preserving JSON edit (`config-edit.ts`, for the config);
  - drafts in app data, and asking before leaving with unsaved changes;
  - the conflict check on save;
  - the status file (`.paperl10n/status/<locale>.json`) with fingerprints and "Mark up to date";
  - the CodeMirror editor with bidi isolation;
  - checks in main after typing pauses (S5c and S5d).
- **The app's own UI strings are a banana-i18n catalog** (`src/ui/i18n/messages/`: `en.json`,
  `qqq.json`, `he.json`; ADR 0009), and `banana-i18n` is already a dependency. Paper Lion can
  translate itself once M4 is done, which makes it a real test project from day one.

## Questions to decide

### 1. Projects with catalogs: which formats a project has

Today a project has exactly one document format. A banana-i18n project (a MediaWiki extension, a
jQuery.i18n app, Paper Lion itself) often has no longform at all, and a docs site may have both.

| Option | Notes |
|---|---|
| **A. At most one document format and at most one catalog format, at least one of the two** (recommended) | Each is detected or pinned on its own (`documentFormat`, a new `catalogFormat`). A project with neither fails as today (the error code renamed or widened). The UI shows pages, catalogs, or both. |
| B. Any number of each | Needed only for a project with two catalog systems at once (banana and gettext). Rare; the config could grow into it later. |
| C. Catalog-only projects as a separate kind of project | Two flows to open a project; mixed projects can't be both. |

**Recommendation: A.** `formatOptions` already keys options by plugin id, so it serves both.

### 2. Finding banana-i18n catalogs (detection and layout)

banana-i18n keeps one JSON file per locale in a messages folder (`i18n/en.json`, `i18n/qqq.json`,
`i18n/he.json`). A project may have several such folders: a MediaWiki extension lists them in
`extension.json` (or `skin.json`) under `MessagesDirs`, for example `i18n/` and `i18n/api/`.

| Option | Notes |
|---|---|
| **A. `MessagesDirs` when there is one, else a scan, with a config override** (recommended) | The scan looks for folders holding the source locale's JSON (with `@metadata`, or with a `qqq.json` next to it), skipping `node_modules` and `.git` as `ProjectFiles` already does. `formatOptions["catalog-banana"].dirs` pins the list when the scan guesses wrong. |
| B. Config only | Predictable, but every project needs setup before anything shows. |
| C. Scan only | Misses nothing obvious, but can't be corrected. |

**Each messages folder is one catalog**, identified by its folder (like a page's document key), with
one file per locale. A folder without the target's file lists every message as missing; the file is
written on the first save, as a new page is.

Single-file layouts (all locales in one JSON, which jQuery.i18n also allows) aren't in M4.

### 3. What a message's status means, and when it becomes up to date

PRD §6: catalogs have a status per message. For longform, M3 decided that only an explicit "Mark up
to date" makes a section up to date, never a save, because a save is often work in progress. A
message is short, and saving its translation usually means it's done.

| Status | Message |
|---|---|
| `missing` | The source has the key, and the target doesn't (or has it empty). |
| `draft` | The target has it, and it was never recorded. |
| `translated` | Recorded, and the source text is unchanged since. |
| `outdated` | Recorded, and the source text changed since. |
| *not in source* | The target has a key the source no longer has (PRD: "orphaned"). Not a status of the four; listed apart. |

When a message is recorded:

| Option | Notes |
|---|---|
| **A. Saving a message's translation records it as up to date; an outdated message also has "Keep as up to date"** for when the source's change doesn't need one (recommended) | Matches how message translation works (translatewiki.net marks a changed source "outdated", and a new translation clears it). The record is the source message's fingerprint in the language's status file, as for pages. |
| B. Explicit "Mark up to date" per message, as for sections | Consistent with longform, but one more click for each of hundreds of short strings. |
| C. No record: only missing, translated, and not in source | Simplest, but never shows that a source message changed, which is the main reason a translation goes wrong. |

**Existing translations** start as `draft`, with the same one-time "Mark all existing translations
up to date" offer as pages (M3 S3c), covering catalogs too.

**Recommendation: A**, with the status file growing a catalogs section (a version bump of its
format; older files still read).

### 4. The message editor

The UI/UX plan's direction C: keyed rows (key · source · target · status), and the row being
edited expanded, with the `qqq` documentation shown prominently.

| Option | Notes |
|---|---|
| **A. CodeMirror for the expanded row's target**, with banana-i18n syntax marked and isolated (recommended) | The same RTL problem as Markdown links: `$1`, `{{PLURAL:$1|…}}`, and `[[Page|text]]` inside a Hebrew sentence reorder it. The M2 editor already isolates inline syntax; this reuses it with a small banana-i18n language. Undo, keyboard, and drafts behave as in pages. |
| B. A plain `<textarea>` | Cheapest, but no isolation: RTL messages with placeholders become unreadable. |

**Recommendation: A.** One editor at a time (the expanded row), not one per row: the list stays
light for 5,000 messages (PRD §9), and the rows show text, isolated, read-only. The list is
virtualized if measuring shows it needs to be.

Keyboard: move between messages without the mouse (next missing or outdated, previous), and Save
(Ctrl/Cmd+S) writes the catalog file with every edited message.

### 5. Validation: what's checked, and how strongly

Warnings shown inline, comparing a translation with its source. Never blocking a save: the
translator may be right (ADR 0009: a Hebrew plural form can drop `$1`).

| Check | Rule (proposed) |
|---|---|
| Parameters `$1`, `$2`, … | The translation uses the same *set* as the source. A missing one is a warning; one the source doesn't have is a warning. |
| `{{PLURAL:$n|…}}` | The same parameters get a plural. The number of forms isn't compared (languages have different numbers). |
| `{{GENDER:$n|…}}` | The same parameter, when the source has one. |
| Links `[[Page|text]]`, `[https://… text]` | The same targets, compared as written (pages and URLs aren't translated). |
| Unbalanced `{{` `}}` or `[[` `]]` | A warning (the message would render broken). |
| HTML tags | The same tags (by name), as for longform components. |
| `{{SITENAME}}`, `{{int:…}}`, and other magic words | Kept as tokens (highlighted, isolated, and compared like parameters), not interpreted. |

The `CatalogFormat` sketch's `placeholders.scan` returns only tokens' text. To check the rules,
tokens need **kinds** (parameter, plural, gender, link, tag, other) and, for plural and gender, their
parameter. This changes the plugin contract (no plugin implements it yet, but the export list test
and the API version make it a deliberate change).

**Recommendation:** the table above, warnings only, with token kinds in the contract. Gettext (M5)
fills in the same kinds (`%s`, `%1$s`, `{name}` → parameters).

### 6. Where validation and highlighting run

The renderer can't import domains or plugins, and the syntax is the plugin's. M3 ran hints in
main and sent the text after typing paused (S5c).

| Option | Notes |
|---|---|
| **A. Main scans and checks the message after a short pause (0.2 s), and the editor marks the token ranges it gets back**, mapped through edits until the next answer (recommended) | No format code in the renderer. Messages are tiny, so a check is fast. The marks lag the typing by the pause. |
| B. A shared banana-i18n tokenizer, as `#markdown-syntax` is shared (ADR 0017) | Instant marks, but format-specific code outside the plugin: "core never names a plugin". Needs an ADR, and gettext would need another. |
| C. The plugin exposes a tokenizer the renderer loads | Plugins in the renderer: a new trust and bundling boundary. |

**Recommendation: A.** The source side's tokens come with the catalog when it's read.

### 7. Plural and gender previews

The UI/UX plan: previews "rendered with banana-i18n itself". `banana-i18n` is already in the UI (for
the app's own strings), with CLDR plural rules for each locale.

**Recommendation:** under the editor, the translation rendered for sample values: each plural form
the target language has (one row per CLDR category, with a sample number), and each gender. Links
render as text. Shown only when the message has a plural or gender. Since the preview is the
renderer using the library on the message text, it's the one place banana-i18n syntax is
interpreted outside the plugin; it's a preview, not a check. (If that's a concern, the preview can
come from main too.)

### 8. Saving: keeping the file's bytes

PRD §7.3: `@metadata`, formatting, and key order are kept. The contract already says `serialize`
patches the original text.

- **A changed message** replaces only its value's text; escaping follows the file (MediaWiki writes
  Unicode unescaped).
- **A new message** in an existing file goes after the nearest preceding key the source has (source
  order), with the file's indentation (tabs in MediaWiki), line endings, and final newline.
- **A new file** for a target is written like the source: `@metadata` with an empty `authors` list,
  then the translated messages in source order, in the source's indentation.
- **An emptied message** is removed from the file (banana-i18n falls back to the source when a key
  is absent; an empty string would show nothing).
- **Messages not in source** stay unless the translator removes them (an explicit action per message,
  and one for all).
- **`@metadata.authors`:** left as is in M4. Adding the translator's name needs a name setting; a
  follow-up (it's how MediaWiki credits translators).
- **The conflict check, drafts, and asking before leaving** work per catalog file as they do per page.

**Recommendation:** as above; a JSON patcher like `config-edit.ts` inside the plugin (plugins import
only `#plugin-api`, so it can't share the workspace's), with the round-trip and contract tests every
plugin has.

### 9. `qqq` documentation

Shown read-only with the expanded message, prominently (direction C), with its own banana-i18n
syntax (`{{msg-mw|…}}`, links) as plain isolated text. A message without documentation says so,
neutrally. **Editing `qqq`** (the developer's job, not the translator's) isn't in M4; neither is
translating into `qqq`, so it never appears as a target language.

### 10. Navigation and the page list

The sidebar lists pages today. With catalogs:

| Option | Notes |
|---|---|
| **A. One list with two groups, "Pages" and "Messages"** (each catalog by its folder, with "310 of 420 up to date"), each group shown only when the project has it (recommended) | One place to see what needs work. Opening a catalog shows its message list in the main area. |
| B. Tabs for pages and catalogs | Hides one kind's progress behind the other. |

The project's progress line counts both ("Up to date: 12 of 40 pages, 310 of 420 messages").

### 11. Architecture

- **`catalog/domain`:** catalogs and messages (with the source, documentation, and target), the
  status rules for messages, and validation over typed tokens. Pure, table-tested.
- **`formats`:** `CatalogFormat` and `CatalogLayout` reshaped by M4 (token kinds, catalogs
  identified by folder, the locales a layout has); the contract test kit gains catalog checks
  (round trip, `serialize` touching only what changed, scanning). The plugin API version goes up.
- **`src/plugins/catalog-banana/`:** detection, the layout (question 2), parse, serialize, and the
  scanner, with fixtures: a MediaWiki extension with two message folders, a jQuery.i18n app, and a
  copy of Paper Lion's own messages.
- **`workspace`:** opening a project with either kind (question 1), listing catalogs with status,
  reading a catalog for a target, checking a message, and saving. A new edge, **`workspace →
  catalog`**, in `scripts/domain-graph.ts` and `docs/architecture.md`.
- **`translation`:** message status from the status file. Its `catalog` edge already exists.
- **IPC:** new methods for listing catalogs (with the documents, or alongside), reading one, checking
  a message, saving, and keeping an outdated message as up to date; each tested end to end.
- **Performance (PRD §9):** a 5,000-message catalog lists, filters, and opens a message quickly.
  Measured with a generated fixture.

## Proposed steps (after the decisions)

- **C1, the contract:** `CatalogFormat` reshaped (questions 2, 5), its contract kit, and the API
  version bump.
- **C2, the plugin:** `catalog-banana` (detection, layout, parse, serialize, scan) with fixtures and
  round-trip tests.
- **C3, catalogs in the domain:** messages, status (question 3), and validation (question 5).
- **C4, opening and listing:** projects with either kind (question 1), catalogs in the sidebar with
  progress (question 10).
- **C5, the message list:** reading a catalog, the rows, search and filters, not-in-source keys.
- **C6, the message editor:** the expanded row with CodeMirror, `qqq`, checks from main (question 6),
  and keyboard navigation.
- **C7, saving:** patching, new files, drafts, the conflict check, and recording status.
- **C8, previews:** plural and gender (question 7).
- **C9, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

Round-trip rule throughout: a catalog that wasn't edited is never rewritten, and an edited one
changes only where it was edited.

## Open questions for the maintainer

- Which real project should M4 be checked against: a MediaWiki extension of yours, a jQuery.i18n
  app, or Paper Lion's own messages?
- Is "saving records it as up to date" (question 3, A) right for how you translate messages?
