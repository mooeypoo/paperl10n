# M3 discussion: sections, source changes, and hints

Status: **decided (2026-10-29); S1–S3 done, S4 next.** See [Decided](#decided). The discussion follows, for
context.

PRD M3: "Section view with per-section status and progress, the full-page view, source-change
highlighting (needs the outdated-detection decision below), preservation hints, the length
comparison, and loose scroll sync." PRD §11 leaves two questions that M3 has to answer first:
**outdated detection** and the **section split level**.

## Decided

| Topic | Decision |
|---|---|
| Outdated detection (PRD §11) | **A status file in the project, one per target language**, committed with the translations: a fingerprint of each source block from when the translation was marked up to date. Never a published file. Shows which blocks changed, not their old wording. |
| Statuses and marking | **The four statuses as in question 2. "Mark up to date" per section and per page**, explicit, never on save. Existing translations start as `draft`, with a one-time "Mark all existing translations up to date". |
| The section view | **One editor per pane, as in M2, aligned at paired headings with spacers.** The full-page view is the same editors without spacers. No new dependency. |
| When the view is chosen | **Once, when the page opens.** Sections that pair open the section view; a page that opens with text whose sections don't pair opens in the full-page view, with a note saying why. A new translation starts as a copy of the source, so it pairs section by section. **While editing, the view stays as it opened:** if the sections stop matching, a short note says so, and the page is paired again only when it's opened again. |
| Link targets in hints | **An optional `DocumentFormat` method** that maps a translation's link target to the source's form (a deliberate plugin API change). Without it, links compare as written. |

Taken as recommended unless the maintainer says otherwise: the split rules in question 3 (the
per-document level last, only if needed); source changes shown in the source pane only; the
length note per page, by rendered characters; loose scroll sync in the full-page view only, last;
and the `workspace → translation` edge and a status-store port with a contract suite. (A pure
section function shared with the renderer isn't needed: the pairing is decided when the page
opens, in main, and comes with the page.)

## Where M2 left us

- Both panes are CodeMirror 6 editors over the whole file (the full-page view, in effect), with
  the live preview, explicit save, drafts, and the conflict check on save.
- A page's status is only "the translation exists or not" (`targetExists`), plus the unsaved
  marker. `missing · draft · translated · outdated` (PRD §6) isn't modelled yet.
- `document` parses into `blocks` (with heading depths) in main; the editor parses the same
  dialect in the renderer (`#markdown-syntax`, ADR 0017). The parsed blocks in `DocumentTextDto`
  are unused by the UI since M2 ([follow-ups](follow-ups.md)); M3 decides whether it needs them.
- The `translation` domain exists but is empty. Its allowed edges are `document`, `catalog`, and
  `locale`. `workspace` (where the use cases that read the project live) can't import it yet.

## Questions to decide

### 1. Outdated detection (PRD §11)

To say "the source changed since this translation was up to date" and to highlight *what*
changed, Paper Lion needs a record of the source as it was when the translator last said "this
is up to date". Where that record lives:

| Option | Shared with others (git) | Touches published files | Shows what changed | Notes |
|---|---|---|---|---|
| **A. A status file in the project** (for example `.paperl10n/status/he.json`), committed with the translations | Yes | No | Per block, from block fingerprints | One file per target language, so translators of different languages don't conflict. Pages are keyed by document key. |
| B. App data only | No: per machine | No | Per block | Simplest, but status is lost on another machine and invisible to co-translators. |
| C. A frontmatter field in each translation (`sourceHash: …`) | Yes | **Yes**: every translated page gains a key the site has to accept | Page-level only, unless the field grows | Starlight and VitePress validate or render frontmatter; an unknown key is a risk per site. |
| D. Git history: remember the source commit the translation matched, diff with git | Yes | No (with A or B to hold the commit) | Exact text diff | Needs git and a committed source; uncommitted edits and rebases complicate it. PRD §11 leaves "git awareness" open. |

**What's recorded (with A or B):** for each page, a fingerprint (hash) of each source block at
the time it was marked up to date. Comparing the stored block list with today's (a sequence
diff) gives changed and new blocks to highlight, and the places where blocks were removed. Section
status follows from the blocks in each source section. Hashes, not text: a snapshot of every
source page would roughly double the repository's content per language. The cost is that Paper
Lion can show *which* blocks changed, not the old wording; git (D) can add that later on top.

**Fingerprints ignore what doesn't change meaning:** line endings and trailing whitespace. Any
other edit (a typo fix included) marks the block changed; deciding that a change "doesn't
matter" stays with the translator, who marks it up to date again.

**Recommendation: A**, block fingerprints in a committed status file, one per target language.
It travels with the project, never edits a published file, and fits the PRD's "blocks are the
unit of source-change tracking". It also answers PRD §11 "Sidecar state" for status: next to the
project.

### 2. What the statuses mean, and when a page becomes "translated"

PRD §6 has four statuses. With A, they can be defined as:

| Status | Page | Section |
|---|---|---|
| `missing` | No translation file. | The page is missing, or the translation has no section paired with it. |
| `draft` | The file exists (or is being started) but was never marked up to date. | Never marked up to date. |
| `translated` | Marked up to date, and every source block is unchanged since. | Marked, and its source blocks are unchanged. |
| `outdated` | Marked once, and the source changed since. | Marked, and a source block in it changed (or was added or removed). |

**Marking up to date** is an explicit action, never a side effect of saving (a save is often a
work in progress):

| Option | Notes |
|---|---|
| **Per section and per page** (recommended) | Each paired section has "Mark up to date"; the page has one for all its sections. Matches per-section progress ("3 of 5 sections up to date"). |
| Per page only | Simpler, but a page with one changed section is all-or-nothing. |
| Automatically on save | Wrong for partial work; rejected. |

The mark is stored when it's made (the status file changes then, not on the next save). It
records the source **as the translator sees it**: if the source file on disk changed since the
page was opened, marking is refused and offers a reload (as saving does in E5), so a version the
translator hasn't read is never marked up to date.

**Existing translations on first open:** a project translated before Paper Lion has no status
file, so every existing translation would read as `draft`. Options: (a) leave them as `draft`
and offer **"Mark all existing translations up to date"** once, for the whole language; (b) treat
pages without a record as `translated` until the source changes (impossible to detect without a
record, so it would never turn `outdated`); (c) guess a baseline from git. **Recommendation: (a)**,
with a clear one-time prompt in the page list. (c) can come with git awareness later.

### 3. Sections: the split level and uneven headings (PRD §11)

PRD §7.2: sections split at headings, at "the document's top section level (usually `##`)".
Proposed rules, in order:

1. **The split level is the shallowest heading depth in the source body**, frontmatter excluded.
2. **Except a lone title:** if that depth appears exactly once and it's the first heading (a
   `# Title` over `##` sections), the split level is the next depth that appears.
3. **The text before the first heading** at that level is its own section, the *intro*.
4. **Frontmatter** is its own row at the top, paired with the translation's frontmatter (its
   `title` and `description` need translating), not part of the intro.
5. **Deeper headings stay inside their section.** A long section without subheadings stays one
   section: M3 doesn't split by length.
6. **Only top-level heading blocks count.** A `#` line in a code block or HTML isn't a heading,
   and neither is one inside a list or a quote. Headings between `:::` fences do count: the
   parser reads a container's content as ordinary Markdown, and the site renders them as headings.
7. **The translation is split at the same level** as its source, and sections pair in order.
   When the counts differ, or the translation's headings sit at a different level, Paper Lion
   says so, shows the pairs it can make up to the first mismatch, and offers the full-page view.
   It never guesses (PRD §7.2).

**Changing the level per document** (PRD §7.2): stored in the status file next to the page's
fingerprints, so it's shared. Recommendation: build it last in M3, only if the default rules
prove wrong on the maintainer's site.

### 4. How the section view is built

| Option | The file as one document | Alignment | Cost |
|---|---|---|---|
| **A. One editor per pane (as now), aligned at paired headings** with spacers, like a side-by-side diff | Yes: drafts, dirty state, undo, conflicts, and round-trip safety from M2 stay as they are | Exact at every paired heading; scroll is locked | Spacers must follow line heights as text wraps (CodeMirror block widgets plus measurement) |
| B. One small editor per section, in rows | No: the file is assembled from slices on save | By layout, for free | Editing across a section boundary (adding or removing a heading) needs re-slicing; undo, search, and selection are per section; M2's file-level machinery needs rework |
| C. One editor per pane, no alignment; a section list beside it jumps both panes to a pair | Yes | At the jump only | Cheapest, but loses "headings on their own row" (PRD §7.2) |

**Recommendation: A.** The section view becomes a way of *showing* the same two editors: spacers
keep each pair of headings side by side, each section's status shows at its heading (with "Mark
up to date"), and the full-page view is the same editors without spacers. Editing a heading
re-pairs live. `@codemirror/merge` does similar alignment, but it's built around a text diff
between the panes, which isn't our model; our own spacers avoid a new dependency. (Ask first if
that changes.)

**Where the section rules run:** status (page list, progress) is computed in main from the files
on disk; the section view in the renderer must re-split live as the translator types. The rules
in question 3 are small and pure. Proposal: write them once as a pure function over headings
(depths and positions), in `translation/domain`, used by main, and shared with `ui/editor`
through a small shared unit like `#markdown-syntax` (an ADR, as 0017 was), or re-split in the
renderer from the same function over IPC. Recommendation: the shared pure function, with an ADR.

### 5. Source-change highlighting

In the **source** pane (PRD §6, "shown on the source side, as a reference"): changed and new
blocks get a background tint and a gutter mark; where blocks were removed, a thin marker between
blocks says "removed text here". A section heading with changes says "changed since marked up to
date". Nothing is marked in the translation: what to change there is the translator's call.

Option for later: the old wording, from git, on hover (needs git awareness).

### 6. Preservation hints

Neutral notes (PRD §6), never errors, about things usually kept as is: code blocks, link
targets, images, components, and frontmatter keys, when their **counts** differ between a source
section and its pair (or the whole page in the full-page view or when sections don't pair).

The catch is **link targets**: translations often point to localized pages (`/guide/` in the
source, `/he/guide/` in Hebrew), so a raw comparison would flag every link on a Starlight site.

| Option | Notes |
|---|---|
| **Ask the format plugin to map a target to the source's form** (recommended) | An optional `DocumentFormat` method (the plugin knows its locale prefixes). The plugin API's export list is frozen by a test, so this is a deliberate API change. Without the method, links compare as written. |
| Compare raw targets | Noisy on every localized site. |
| Count links, not targets | Misses a link pointing to the wrong page. |

Code blocks compare by count and by their language tag; their contents don't (comments in code
are often translated). Components compare by tag name. Frontmatter compares by keys.

### 7. Length comparison

A page-level note in the translation pane's header: "about 80% of the source's length". Measured
on text as rendered: Markdown syntax, code blocks, URLs, and frontmatter removed (the live
preview's rules already know what's syntax). Characters, not words (word counts mean little
across scripts). Information only: never a warning, never per section (PRD §7.2).

### 8. Loose scroll sync (full-page view)

With option 4A, the section view is aligned and doesn't need it. In the full-page view: scrolling
one pane scrolls the other so the nearest paired heading lines up, and between headings by
relative position. A toggle, on by default. Recommendation: build it with the full-page toggle, as
the last step.

### 9. Architecture

- `translation/domain`: sections (split, pair), fingerprints and the block sequence diff, status,
  preservation-hint counts, length. Pure, table-tested.
- `translation/application`: a `TranslationStatusStore` port (read and write a language's status
  file), with a contract suite run against an in-memory fake and the real adapter. The real
  adapter writes atomically and only inside the project, with the same checks as `workspace`'s
  `ProjectWriter` (which `translation` can't import: there's no edge that way).
- **A new domain edge, `workspace → translation`**, so the use cases that read the project
  (listing pages, reading a pair) can report status. Adding an edge is a reviewed change
  (`scripts/domain-graph.ts`, `docs/architecture.md`). The alternative, `translation` use cases
  depending on `workspace`, inverts today's layering.
- New IPC methods: marking up to date (a section, a page, all existing pages), and status on the
  page list and the pair.
- Performance (PRD §9: ~1,000 pages): listing status reads and hashes every source page. Measure
  first; if it's slow, list with "exists" first and fill status in after.

## Proposed steps (after the decisions)

- **S1, sections in the domain:** the split and pairing rules (question 3) as pure functions, with
  table tests over real-site shapes (lone title, intro, uneven levels, mismatched counts,
  headings in code and containers).
  - *Done-notes:* `translation/domain/sections.ts`: `splitLevel`, `sectionsAt`, and
    `pairSections` over an `OutlineBlock` list (a block's range, a heading's depth, whether it's
    the frontmatter). The domain layer can't import `document`, so `translation/application`
    maps a parsed document onto it (`outlineOf`, `pairDocumentSections`). The rules are in
    [the domain doc](../domains/translation.md).
    - **One refinement to question 3's rule 7:** when headings don't line up, only the frontmatter
      and intro pair (they pair by place). "The pairs it can make up to the first mismatch" would
      need a guess at where the mismatch is (an extra section near the end looks the same, by
      count, as one near the start), so the heading sections stay unpaired and the pairing says
      why (`count` or `level`, with both counts).
    - A lone single heading (`# Title` and text) splits at that heading, as one heading section.
    - Checked with the real parser over the plugin fixtures and READMEs: a `# Title` over `##`
      sections splits at `##`, with the title in the intro.
    - Mutation checks, each failing tests: no lone-title rule, a lone title not required to come
      first, the intro merged into the frontmatter, the reason always `count`, pairing ignoring
      counts, and sections leaving gaps.
- **S2, the section view:** aligned editors (4A), per-section rows marked at their headings, the
  mismatch message, and the toggle to the full-page view. No status yet. In two PRs:
  - **S2a, the pairing with the page:** `readDocumentPair` pairs the source's sections with the
    text the translation opens with (the draft, else the file, else a copy of the source), and
    the IPC `DocumentPairDto` carries it as `sections`.
    - *Done-notes:* the new domain edge `workspace → translation` (`scripts/domain-graph.ts`,
      `docs/architecture.md`). `SectionPairingDto`: when paired, each pair's kind and its range on
      each side (`null` where a side lacks it); when not, the reason and both counts. The pairing
      parses a draft with the translation's MDX setting. Tests: the file, the draft over the file,
      a copy of the source for a new translation, an unpaired file, and the end-to-end IPC test
      with the real parser. Mutation checks, each failing tests: the draft ignored, and a new
      translation paired with nothing.
  - **S2b, the view:** the aligned editors, the section markers, the full-page fallback and its
    note, the toggle, and the "sections changed" note while editing.
    - *Done-notes:*
      - **Lining up** (`ui/editor/section-alignment.ts`): each editor keeps where its sections
        start (anchors, set when the page opens and moved by edits; one is dropped when its text
        is deleted or its line left empty). In the section view, a rule marks each section's first
        line, and two editors side by side get spacers (block widgets) above a section that starts
        higher than its pair, walking the pairs in order. They're measured from both editors in one
        measure pass and applied right after it (an editor can't be updated while it measures).
        Stacked panes (a narrow window) get no spacers. The intro lines up too, so the panes'
        different header heights don't matter.
      - **Offsets:** main's offsets are into the file as read; the editor drops the BOM and counts
        CRLF as one character, so they're mapped (`editorPosition` in `file-text.ts`).
      - **Choosing the view:** a page asks for sections, and shows them when its pairing is for the
        text the translation editor starts with (not after discarding a restored draft, which shows
        the file). Otherwise it shows in full, with a note: a different number of sections (with
        both counts) or headings at another level. "Sections" and "Full page" switch between them
        (`aria-pressed`); switching keeps the text, its edits, and the anchors where edits moved
        them.
      - **While editing:** after typing pauses (0.3 s), the translation's top-level headings at the
        split level are counted; a different count than when the page opened shows "The sections
        have changed since this page opened. They'll be paired again when you reopen it." The view
        doesn't change. The page's title, view buttons, and notes stay at the top while the page
        scrolls, so the note is seen where the typing is.
      - Tests: the spacer arithmetic (table), marks and anchors in an editor (edits, hidden marks,
        deleted sections, the document start), heading counts (code, lists, quotes, containers,
        Setext); through the UI: the view a page opens in, both notes, the toggle keeping edits, a
        new translation, a discarded draft, and a file with a BOM and CRLF; and an E2E in Electron:
        three pairs line up within 2 px with sections of different lengths on both sides, the
        full page drops the rules, and a new heading shows the note while the panes stay lined up.
      - Mutation checks, each failing tests: changes never noticed, the pairing used for another
        text, the toggle resetting the anchors, anchors kept on emptied lines, the document's start
        anchor moving, a rule on the first line, file offsets used unmapped, and "Sections" offered
        for an unpaired page. One survived and was removed as redundant: choosing "full" for an
        unpaired page on open (it can't show sections anyway).
- **S3, status:** the status file and its port, fingerprints, "Mark up to date" (section, page,
  all existing), the four statuses in the page list, and section progress in the page header. In
  three PRs:
  - **S3a, status in the domain:** fingerprints, page records, the status rules, marking, and the
    status file's format, pure and table-tested.
    - *Done-notes:* `translation/domain`: `fingerprint.ts`, `sequence.ts` (a longest common
      subsequence), `status.ts`, and `status-file.ts`; `sectionFingerprints` in
      `translation/application` reads a parsed source. The rules and the format are in
      [the domain doc](../domains/translation.md).
      - **One refinement to question 1:** a page's record keeps *every* source section, each by
        identity (kind and heading fingerprint) and, once marked, with its blocks' fingerprints.
        Keeping the unmarked ones tells a section never marked (`draft`) from one added to the
        source since (`outdated`), and lets a removed section show on the section before it.
      - Status needs only the source and the record, not the translation's text, so the page
        list can show it without parsing translations.
      - Mutation checks, each failing tests: no line-ending or whitespace normalization, pairing
        changed headings across kinds, a removal not shown on the section before it (marked or
        not), new sections read as draft, an outdated section kept under its old heading, a new
        section losing its outdated state when another is marked, marking not clearing a
        section's removals, removed sections never marked kept, a removal shown on the wrong
        section, all-removed pages read as translated, removals listed before additions, keys
        sorted by locale, newer versions read, and malformed fingerprints accepted.
  - **S3b, status in main:** reading and writing the status file (`.paperl10n/status/<locale>.json`)
    through the project's `ProjectFiles` and `ProjectWriter` (atomic, inside the project, with
    their contract suites) instead of a new port; status in the page list and the pair; marking
    (sections, a page, all existing translations), refused when the source changed on disk.
    - *Done-notes:* `workspace/application/translation-status.ts` (the file's place, reading it,
      a page's status, one change at a time per file) and `mark-up-to-date.ts` (`markUpToDate`,
      `markExistingUpToDate`). The IPC contract: `listSourceDocuments` returns `{ documents,
      statusFile }` (each document with its `status`; the file's `exists` and `problem`), the
      pair has `status` (the page's, each source section's, and `sourceFingerprint`), and two new
      methods. Five new error codes, with messages in en, he, and qqq. The details are in
      [the workspace doc](../domains/workspace.md#status).
      - **No new port** (a refinement of question 9): the existing `ProjectFiles` and
        `ProjectWriter` ports already write atomically inside the project and have contract suites;
        a second store would repeat them.
      - **A broken status file never stops work:** pages list as never recorded, the list says why
        (for a merge conflict, say), and marking is refused, so it's never overwritten.
      - **Speed** (PRD §9): listing a project with 1,000 recorded pages (12 sections each) takes
        about 0.7 s on the maintainer's machine; with nothing recorded, 16 ms (sources aren't read).
        Good enough for now; caching by source fingerprint is the next step if it isn't.
      - Tests: every use case's success path and errors (the source changed, an index past the
        sections, an unreadable, invalid, or newer file never overwritten, an unwritable folder, two
        marks at once), and every IPC method end to end with the real parser and disk (marking, the
        source changing, a merge conflict in the file).
      - Mutation checks, each failing tests: no fingerprint check, no index check, recorded pages
        marked again by "all existing", a write with nothing marked, sources of unrecorded pages
        read, marks not run one at a time, an invalid file read as empty, a missing translation's
        page not `missing`, section indices accepted out of order, and a saved new page not becoming
        `draft` in the list.
  - **S3c, status in the UI, by page:** the four statuses in the page list, the page's status and
    section progress in its header with "Mark page up to date", and the one-time "Mark all existing
    translations up to date".
    - *Done-notes:*
      - **Page list:** each page's mark shows its status by shape as well as color (missing hollow,
        draft grey, up to date green, outdated an orange diamond); unsaved changes are a separate
        accent dot at the row's end. Above the list: "Up to date: 2 of 4" and, when some are, how
        many are outdated. New tokens: `--pl-color-ok` and `--pl-color-warn`, both themes.
      - **Marking existing translations:** offered in the page list while the language has no
        status file and some pages have a translation; "Not now" puts it off until the project is
        opened again. After marking, the list is read again and the open page's header updates
        without reading the page again (unsaved edits stay).
      - **The page's header** (sticky, with the view buttons): its status, "Sections up to date: 1
        of 3", and "Mark page up to date" (not for a page without a translation file; a new one
        becomes a draft when first saved). A refused mark shows why; when the source changed on
        disk, "Reopen the page" reads it again, asking about unsaved changes first.
      - **A status file that can't be read** is explained above the page, with its details.
      - Tests: the list's statuses, counts, and unsaved marker; the offer (shown, done, put off, not
        shown with a status file, a broken one, or no translations, and its error); the header
        (progress, marking, a page without a translation, saving keeping it up to date, saving a new
        one making it a draft); the refused mark and reopening (with and without unsaved changes);
        and an E2E in Electron: marking all existing writes the status file, a source changed on
        disk lists as outdated, and marking the page makes it up to date. A new test checks the two
        copies of the dark theme define the same tokens (it caught one the first draft missed).
      - Mutation checks, each failing tests: the offer ignoring the status file or its problem, or
        shown without translations; the open page not updated after marking all; the list not
        updated after marking a page; a saved new page not becoming a draft, or a saved page always
        becoming one; reopening without asking about unsaved changes; a status shown for a page
        without a translation; a mark's error kept on another page; and the offer kept after a page
        is marked.
  - **S3d, status by section:** each section's status and "Mark up to date" at its heading in the
    section view.
    - *Done-notes:* `ui/editor/section-status.ts`: a bar above each section's first line in the
      translation pane (a block widget at the section's anchor, so it follows edits), with the
      section's status and, unless it's up to date, "Mark up to date". The alignment spacer goes
      above the bar (spacers now sit at side −2), so the bar stays with its heading and the headings
      still line up: the bar counts as the section's own height. The bar takes the section's rule.
      - **The first line's bar sits just above the editor**, outside its text: as a block widget at
        the document's very start, it sometimes left Chromium without a caret when the editor got
        focus back (the link-dialog E2E failed 4 times in 20; `main` passed 20 of 20). Above the
        editor, it still counts in the alignment (it moves the editor down), and the link test
        passed 30 of 30. Tab therefore reaches it before the editor, and the others after.
      - **Interface text in the document's pane:** the bar carries the interface's `lang` and
        `dir`, and isn't editable. Each button's accessible name says which section it marks ("Mark
        section 2 of 4 up to date").
      - **Keyboard:** checked in Electron. Tab from the translation editor reaches each section's
        button that follows in order, then leaves; Enter marks it. The E2E covers it.
      - **Screen readers:** the bars are inside the editor's text box, so they're read with its
        content. A check with a real screen reader is in [follow-ups](follow-ups.md).
      - **The index sent** is the section's among the source's sections, not the pair's (a pair with
        only a translation side has no status).
      - Tests: the bars in an editor (shown, the button and its section, waiting while a mark is on
        its way, only in the section view, following edits, one bar on a line two sections were
        joined onto, the interface's language and direction); through the UI (each section's status
        at its heading, marking one with the source's index, the header updating, no bars in the full
        page or before the translation has a file, buttons waiting while marking); and the E2E
        above, with the headings still lined up after marking.
      - Mutation checks, each failing tests: the pair's index sent instead of the source's, the
        buttons not waiting while marking, bars outside the section view, no `dir`, two bars on
        one line, bars lost when the editor restarts, and a button on an up-to-date section.
- **S4, source changes:** highlighting changed, new, and removed blocks in the source pane.
- **S5, hints and length:** preservation hints per section (with the plugin's link mapping, if
  chosen) and the length note.
- **S6, full-page sync:** loose scroll sync and, if needed, the per-document split level.
- **S7, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

Round-trip rule throughout: marking, highlighting, and hints never change a document's text;
only the status file is written by them.
