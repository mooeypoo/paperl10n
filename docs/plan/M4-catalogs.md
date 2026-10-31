# M4 discussion: banana-i18n catalogs

Status: **decided (2026-10-31); C1–C3 done, C4 next.** See [Decided](#decided). The discussion follows, for
context.

PRD M4: "banana-i18n. Catalog list, split message editor, `qqq` docs, and validation." PRD §7.3
lists what the catalog editor does: a list of messages (key · source · target · status, with search
and filters), a focused editor for one message with its `qqq` documentation, inline warnings for
placeholders, `{{PLURAL:…}}`, `{{GENDER:…}}`, and links, `@metadata`, formatting, and key order
kept on save, and keys missing from the target or no longer in the source. The UI/UX plan's
direction C ("Catalog") and its banana-i18n helpers (highlighting, warnings, plural and gender
previews, placeholder autocomplete) say how it looks.

## Decided

| Topic | Decision |
|---|---|
| Message status (question 3) | **Saving a message's translation records it as up to date**; an outdated message also has "Keep as up to date". The record is the source message's fingerprint in the language's status file. |
| Where the syntax is found (question 6) | **In main, after a 0.2 s pause**: main scans and checks the message and returns token ranges, which the editor marks. No format code in the renderer. |
| Validation (question 5) | **Warnings only, never blocking a save.** |
| Real projects to check against | **Paper Lion's own messages** (`src/ui/i18n/messages/`) and **a jQuery.i18n app** (a plain messages folder, no `extension.json`). MediaWiki's `MessagesDirs` is still supported, from fixtures. |

Taken as recommended unless the maintainer says otherwise: at most one document and one catalog
format per project, at least one of the two (question 1); `MessagesDirs`, else a scan, with a config
override (question 2); CodeMirror for the expanded row (question 4); plural and gender previews with
`banana-i18n` in the renderer (question 7); saving as in question 8, `@metadata.authors` untouched;
`qqq` read-only (question 9); one list with "Pages" and "Messages" groups (question 10); and the
`workspace → catalog` edge (question 11).

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
one file per locale. (C1 made the identity a catalog key, which banana-i18n sets to the folder; see
its done-notes.) A folder without the target's file lists every message as missing; the file is
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
  - *Done-notes:* plugin API version 3 (`SUPPORTED_API_VERSIONS` is `[3]`; both built-in plugins
    moved). The contract is in [the formats doc](../domains/formats.md#catalogformat):
    - **Catalogs by key:** `listCatalogs` returns `SourceCatalog`s (key, source file, locale, and
      the documentation file when there is one), named like `SourceDocument`. The layout's
      `locales` lists the locales the catalogs have files for, and `targetPathFor(catalog, locale)`
      replaces `catalogPathFor`, naming the file the system's way (`pt-br.json`).
    - **Revised with the maintainer: a key, not a folder.** C1 first identified a catalog by its
      folder, as question 2 said. gettext's common layout keeps a folder per locale
      (`locale/he/LC_MESSAGES/myapp.po`), so a catalog's files aren't in one folder, and several
      catalogs (domains) share each folder. A `CatalogKey` (`catalogKey`, in `catalog`) is chosen
      by the plugin: banana-i18n uses the messages folder, gettext the domain. The layout stays the
      system's: the plugin detects it and `targetPathFor` answers in it; a plugin option covers
      what files can't tell, and each plugin's fixtures check its real paths. The kit dropped its
      "inside the folder" rules and checks unique keys instead.
    - **`serialize` takes a `CatalogEdit`:** the source's parsed file, the target's (or `null` for a
      new file), and the changes. The sketch's `serialize(original, changes)` couldn't place a new
      message in source order or shape a new file like the source (question 8), so the source is
      passed too. `parse(text)` no longer takes a location: the same parse serves every file, and
      `ParsedCatalog` is just the text and its messages.
    - **Typed tokens:** a `PlaceholderToken` is a union by kind. Beyond the asked-for parameter on
      plural and gender tokens, **links carry their target and tags their name**, because
      question 5 compares those, and `catalog/domain` can't read banana-i18n syntax to find them
      (C3 would otherwise need another API change). Tokens may nest, never partly overlap.
    - **Two additions plugins need:** `messageKey` (the `catalog` domain's constructor, any non-empty
      text; plugins couldn't make a `MessageKey` before) in `#plugin-api`, and a
      `formats.invalid-catalog` plugin error for a file that isn't valid for its format, mapped
      through the IPC error codes and the UI's messages (en, he, qqq).
    - **The kit** picks document or catalog checks by the manifest's kind. Catalog checks: listing,
      locales, paths, round trip, writing only what changed (set to the same, set and set back
      byte for byte, remove, a missing key removed), adding in source order, new files in source
      order, scanning (fixture messages plus tricky texts), and malformed text. `fakeCatalogPlugin`
      (a `key=value` format, exported for later steps' tests) is the kit's well-behaved plugin; the
      kit caught a bug in it while being written (a changed last line gained a line break).
    - Tests: the kit against 36 broken catalog plugins, one or more per check; the registry's
      guarded catalog view (calls passed through, crashes, errors with the plugin id);
      `placeholderProblems`; `catalogKey` and `messageKey`; a catalog plugin written against
      `#plugin-api` alone; the frozen export list (`catalogKey` and `messageKey` added).
    - Mutation checks, each failing tests: each assertion of the catalog checks and of
      `placeholderProblems` dropped in turn, the kit always picking document checks, the registry
      dropping `locales` or not guarding `targetPathFor`, and `catalogKey` or `messageKey`
      accepting the empty key. "Set back" survived at first (nothing broke only that) and got an
      isolating broken plugin.
- **C2, the plugin:** `catalog-banana` (detection, layout, parse, serialize, scan) with fixtures and
  round-trip tests.
  - *Done-notes:* `src/plugins/catalog-banana/`, described in its
    [README](../../src/plugins/catalog-banana/README.md). Not yet in `app/plugins.ts`: opening a
    project uses only document formats until C4, so registering it now would only add detection.
    - **Layout (question 2):** the `dirs` option, else `MessagesDirs` in `extension.json` or
      `skin.json` (a folder or a list, in order), else a scan for folders holding the source's file
      with `@metadata` or a `qqq.json` beside it. The catalog key is the folder (`.` for the root).
      A locale's file is an existing one matching it ignoring case, else a lowercase name, as
      MediaWiki writes them, unless the folder's names keep case. The scan also finds sample
      catalogs (fixtures, examples): `dirs` leaves them out.
    - **Reading and writing (question 8):** a strict JSON reader that keeps each member's offsets,
      and a patcher over them: a changed value, a removal with its comma, an insertion after the
      nearest earlier source message (with the file's indentation, `": "`, and line endings), and
      a new file shaped like the source with empty `authors`. Escaping follows the file. No JSON
      library: `JSON.parse` loses offsets, and no dependency was added.
    - **Scanner (question 5's kinds):** templates and links matched with their own closing
      brackets and scanned inside, so tokens nest by construction; `PLURAL` and `GENDER` in any
      case, with the parameter before the first top-level `|`; external links need a URL.
    - **Fixtures:** a MediaWiki extension (two folders through `MessagesDirs`, `pt-br.json` escaped,
      a Hebrew file with a key the source no longer has), a jQuery.i18n app (no `qqq.json`; a CRLF,
      fully escaped Hebrew file; a French file without a final newline), a copy of Paper Lion's own
      messages, a folder found only through `dirs`, and a project that isn't banana-i18n. The
      contract kit runs on all five, so Paper Lion's real messages round-trip byte for byte and
      survive the edit checks.
    - Tests: the JSON reader (escapes, BOM, 14 kinds of malformed text) and patcher (each kind of
      change, each placement, styles: tabs, spaces, CRLF, one line, escaped, mixed); the scanner
      (23 cases: nesting, unclosed syntax, crossing brackets, offsets with surrogate pairs);
      detection, layout, options, and errors.
    - Mutation checks, each failing tests: every rule of the reader (BOM, duplicates, strings
      only, trailing text, control characters, escapes), the patcher (same text untouched, each
      removal and placement, separator, indentation, escaping, final newline, empty authors), the
      scanner (nesting, case, scanning inside, tag bounds and names, URLs), and the layout (case,
      `MessagesDirs` forms, `qqq.json`, documentation, options, the root key). Survivors at first, each resolved: the short `\u` escape (its test text failed
      later anyway; now isolated), the indentation taken from the first member (a test where it
      differs), a parameter guard that can't trigger (removed: digits never cross a range's end),
      and folder trimming that `projectPath` already does (removed).
- **C3, catalogs in the domain:** messages, status (question 3), and validation (question 5). In
  two PRs, following where M3 put status:
  - **C3a, messages and checks (`catalog`):** pairing a catalog's files into messages, and checking
    a translation's tokens against its source's.
    - *Done-notes:* the [catalog doc](../domains/catalog.md) has the rules.
      - **The token types moved into `catalog`** (`domain/placeholder.ts`, with `comparedValue`).
        `catalog` can't import `formats` (the edge goes the other way), and the checks need them.
        `#plugin-api` exports them from `#domains/catalog`, as it does `Message`: the same names,
        so the export list and the API version don't change.
      - `pairCatalog(source, target, documentation)`: source order, each with its documentation
        and translation (an empty one reads as none), and the target's keys the source lacks.
      - `checkMessage(source, translation)`: tokens compared as sets by kind and compared value.
        **One refinement to question 5:** an added `plural` or `gender` isn't a warning (a
        language can need one its source doesn't); a missing one is. **Unbalanced brackets**
        compare `{}` and `[]` counts with the source's rather than with zero, which keeps the check
        free of any format's syntax (it can't tell `{{` from `{`).
      - Tests: pairing (order, empty text, not in source, stray documentation, missing files, an
        empty source), checking (22 cases, the order of warnings, duplicates), and `comparedValue`.
      - Mutation checks, each failing tests: empty text read as a translation, not-in-source
        dropped, documentation dropped, plural and gender not allowed to be added (or tags allowed
        too), the kind or the compared value left out of comparison, the empty-translation rule,
        brackets balanced against zero, `[]` unchecked, and each kind's compared value. One
        survived and was simplified: keeping a token's first appearance by hand (a `Map` keeps it).
  - **C3b, message status (`translation`):** status per message from the status file, which grows
    a catalogs section.
    - *Done-notes:* the rules are in [the translation doc](../domains/translation.md).
      - `messageStatus(source, translation, recorded)` and `recordMessages(record, messages)`:
        saving (or keeping) records the source's fingerprint now; removing or emptying a
        translation drops its record. A message's fingerprint is a block's (`messageFingerprint`).
      - **The status file's version 2** adds `catalogs` (catalog key → message key →
        fingerprint, sorted, one message per line). It's written as version 2 only when a catalog
        records a message, so page-only projects keep version 1 and an older Paper Lion can still
        read them; version 1 files read as having no catalogs.
      - `markUpToDate` and `markExistingUpToDate` wrote `{ pages }` back, which would have dropped
        catalog records: they now write the rest of the file as read (the type change caught it).
      - Tests: each status, the fingerprint's normalization, recording (saved, re-recorded, others
        kept, removed and emptied), the catalogs section (written, read back, version 1 kept for
        page-only files, version 1 read, odd keys, five malformed shapes), and marking pages keeps
        catalogs (both use cases). The "newer version" tests moved from 2 to 3.
      - Mutation checks, each failing tests: every status rule, both recording rules, each parse
        check of the catalogs section, dropping empty catalogs, the version 1 fallback, sorting
        messages, and either use case writing pages without catalogs.
- **C4, opening and listing:** projects with either kind (question 1), catalogs in the sidebar with
  progress (question 10). In two PRs:
  - **C4a, opening and listing (main):** a project with pages, catalogs, or both; the catalogs
    with their progress over IPC; `catalog-banana` registered.
    - *Done-notes:* the use cases are in [the workspace doc](../domains/workspace.md).
      - **The opened project** has `documents` and `catalogs`, each a format with its layout, or
        `null`, instead of one document format and layout. The page use cases find a page
        through one helper (`findDocument`), so a project without pages answers any page with
        `workspace.unknown-document`, lists none, and marks none.
      - **Choosing formats:** `catalogFormat` in the config, next to `documentFormat`. Each kind
        is pinned or detected on its own; detection runs once. `workspace.no-document-format` is
        now `workspace.no-format` (neither kind), and `workspace.unknown-catalog-format` is new.
        The project's languages come from both layouts (`projectLocales`).
      - **`listCatalogs`** (use case and IPC method): each catalog's paths, whether the target
        exists, and its progress (counts by message status, and not-in-source keys). A catalog
        whose file can't be read still lists, with the problem (`workspace.catalog-unreadable`,
        new, or the plugin's `formats.invalid-catalog`).
      - **The project summary** carries `documentFormat` and `catalogFormat`, each nullable. The
        header shows each format the project has; the sidebar is C4b.
      - The `workspace → catalog` edge (`scripts/domain-graph.ts`, `docs/architecture.md`).
      - `catalog-banana` is in `app/plugins.ts`. Opening Paper Lion's own folder now also finds
        the plugin's fixtures as catalogs (C2's known limit): `dirs` leaves them out.
      - Tests: opening (catalogs only, both kinds, a pinned catalog format, the best detection
        of each kind, catalog options, both new errors); every page use case on a project with
        catalogs only; `listCatalogs` (statuses from the status file, no catalogs, with pages
        too, an unreadable status file, an unreadable source, a translation the format can't
        read, the layout's errors, an unknown project, no target); `catalogProgress`;
        `projectLocales`; the config's `catalogFormat`; and `listCatalogs` end to end over IPC
        on a copy of `catalog-banana`'s MediaWiki fixture.
      - Mutation checks, each failing tests: a pinned catalog format of the wrong kind, the best
        match of each kind, failing only without both kinds, a catalog layout's error, the
        summary's catalog format, the catalogs' locales and their de-duplication, the status
        record, not-in-source counts, a translation's problem, listing catalogs at all, page
        requests without pages, marking existing without pages, and the config's
        `catalogFormat`. Two conditions turned out redundant (a pinned format can't be replaced
        by detection anyway) and were removed.
  - **C4b, the sidebar (UI):** "Pages" and "Messages" groups, each catalog with its progress,
    and the project's progress line counting both.
- **C5, the message list:** reading a catalog, the rows, search and filters, not-in-source keys.
- **C6, the message editor:** the expanded row with CodeMirror, `qqq`, checks from main (question 6),
  and keyboard navigation.
- **C7, saving:** patching, new files, drafts, the conflict check, and recording status.
- **C8, previews:** plural and gender (question 7).
- **C9, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

Round-trip rule throughout: a catalog that wasn't edited is never rewritten, and an edited one
changes only where it was edited.

## Open questions for the maintainer

- Which jQuery.i18n app to check against, if there's a particular one; otherwise a fixture shaped
  like one.
