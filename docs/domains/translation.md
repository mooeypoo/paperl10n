# Domain: `translation`

Source↔translation pairing, status, and source-change tracking. Code: `src/domains/translation/`.
Other code imports `#domains/translation`. Decisions: [M3 plan](../plan/M3-sections.md).

## Ubiquitous language

| Term | Meaning |
|---|---|
| Outline | A document's top-level blocks, as much of them as sections need: each block's range, a heading's depth, and which block is the frontmatter. Built from a parsed document (`outlineOf`). |
| Split level | The heading depth a document splits into sections at. |
| Section | A `frontmatter` row, the `intro` (the text before the first heading at the split level), or a `heading` section (a heading at the split level and everything up to the next one). |
| Section pairing | The source's and translation's sections, side by side in order, or the reason they don't line up. |
| Fingerprint | A 64-bit hash of a block's text, ignoring line endings and trailing whitespace: what status keeps of the source. |
| Marking up to date | The translator saying a section (or a whole page) matches its source as it is now. Explicit, never a side effect of saving. |
| Page record | Every source section of a page as of its last mark: each one's kind, heading fingerprint, and its blocks' fingerprints when it was marked (or none: never marked). |
| Status file | One per target language, committed with the translations: the page records, by document key, and the catalog records, by catalog key. |
| Catalog record | Each recorded message of a catalog: the fingerprint of its source text when its translation was last saved or kept as up to date, by message key. |
| Message status | `missing`, `draft`, `translated`, or `outdated`, for one message of a catalog. |
| Source change | A source block changed or new since its section was marked up to date, or a place where marked text was removed. |
| Status | `missing`, `draft`, `translated`, or `outdated` (PRD §6), for a page and for each of its source sections. |

## Rules (sections)

1. **The split level is the source's shallowest heading depth**, except a **lone title**: when
   that depth appears once, as the first heading (a `# Title` over `##` sections), the split
   level is the next depth that appears. A document without headings has no split level: its
   whole body is the intro.
2. **The text before the first heading at that level is the intro** (a lone title included).
   **The frontmatter is its own section.**
3. **Deeper headings stay inside their section**; long sections aren't split.
4. **Only top-level heading blocks count**: not a `#` line in code or HTML, nor a heading in a
   list or a quote. Headings between `:::` fences do count (they're top-level blocks).
5. **The translation splits at its source's level.** Heading sections pair in order when the
   counts match. Otherwise the pairing says why: `count` (a different number at that level) or
   `level` (the translation's own headings sit at another level, or it has none), with both
   counts. It never guesses: only the frontmatter and intro pair then, by place.
6. **Sections cover the text:** each runs from its first block to the start of the next section,
   the last to the end, so whitespace between blocks belongs to the section before it.

## Rules (status)

1. **Status reads the source and its record only**, never the translation's text (except whether
   its file exists). A page without a translation file is `missing`; a page without a record is
   `draft`.
2. **Fingerprints ignore line endings and whitespace at line ends.** Any other change, a typo fix
   included, makes a block changed: whether it matters is the translator's call.
3. **Finding a section in its record:** sections match by identity (kind, and a heading
   section's heading fingerprint), in order, as a longest common subsequence. Between matches, an
   unmatched source section takes the first unmatched recorded section of the same kind (a changed
   heading). Sections left over are **new**; recorded sections left over were **removed**, and
   belong to the source section before them (or the first one, when they came first).
4. **A section is** `draft` when it was never marked; `translated` when it was marked and its
   blocks' fingerprints are the same now; `outdated` when they differ, when it's new since the
   page was recorded, or when a marked section removed after it hasn't been dealt with.
5. **A page is** `outdated` when any section is (or every section was removed from the source
   after being marked), `translated` when every section is, and `draft` otherwise.
6. **Marking** records the marked sections as the source has them now, and clears the removed
   sections they carry. The others keep what they had (an outdated section keeps its old
   fingerprints, under its current heading); on a page's first record they're recorded as never
   marked. A removed section that was never marked is forgotten. Marking a page records all of it.

## Rules (source changes)

1. **Read from the same record as status:** which source blocks changed since their section was
   marked, never their old wording. A page never recorded, or a section never marked, shows none.
2. **Within a marked section,** its blocks are compared with the marked fingerprints as a longest
   common subsequence. In each gap between equal blocks, as many new blocks as were removed are
   `changed`, the rest `added`, and removed blocks left over are a **removal** at that place.
3. **A section new since the record** is all `added`.
4. **A marked section removed from the source** is a removal at the end of the section before it,
   or before the first section when it came first (or at the document's start when none are
   left). A removed section never marked isn't shown.
5. Places are the blocks' ranges in the source's text; a removal is before the block that
   follows it, or after the section's last block.

## Rules (message status)

Decided in [the M4 plan](../plan/M4-catalogs.md), question 3.

1. **`missing`:** the target doesn't have the message, or has it empty.
2. **`draft`:** the target has it, and it was never recorded (an existing translation, until it's
   saved or kept as up to date).
3. **`translated`:** recorded, and the source text's fingerprint is the recorded one.
4. **`outdated`:** recorded, and the source text changed since.
5. **Saving a message's translation records it** against its source as it is now; **keeping an
   outdated message as up to date** does the same without changing the translation. Unlike a
   page's sections, a save is enough: a message is short, and saving it usually means it's done.
6. **Removing or emptying a translation drops its record.** Other messages keep theirs.
7. **A message's fingerprint is a block's** (`blockFingerprint`): line endings and trailing
   whitespace don't count; any other change, a typo fix included, does.
8. Messages the target has and the source doesn't ("not in source", [catalog](catalog.md)) have
   no status.

## Rules (preservation hints and length)

1. **Hints are neutral notes, never errors or status** (PRD §6): things a translation usually
   keeps as is, when the source and the translation don't have the same ones. The things are the
   document's preserved elements ([document](document.md)): code blocks (by language), links and
   images (by target), components (by tag name), and frontmatter keys.
2. **Compared as multisets, per kind:** order doesn't matter, repeats do. A hint lists the values
   only the source has (`missing`, in the source's order) and those only the translation has
   (`extra`). Kinds without a difference aren't listed.
3. **Per section pair**, when the translation as written pairs with the source (the section rules
   above), so a link moved to another section shows; a pair with only one side has none. **And for
   the page**, always.
4. **A translation's links are read in the source's form** through the format plugin
   (`sourceLinkTarget`: `/he/guide/` → `/guide/`), so localized links aren't flagged. Images
   aren't mapped. The source's links are compared as written.
5. **Length as rendered:** characters other than whitespace, without Markdown syntax, link
   targets, code blocks, HTML, MDX lines, link definitions, container fences, and the frontmatter.
   Characters, not words (word counts mean little across scripts). Information only.

## The status file

`version` (1 or 2) and `pages`: each document key's record, a list of sections. A section has
`kind`, `heading` (heading sections only), and `blocks`, the fingerprints when it was marked
(absent: never marked; empty: new in the source since, not marked yet).

Version 2 (M4) adds `catalogs`: each catalog key's record, an object of message keys and their
source fingerprints. A file is written as version 2 only when a catalog records a message, so a
project with pages only keeps version 1, which an older Paper Lion still reads. Version 1 files
are read as having no catalogs; `catalogs` in a version 1 file is an error.

Written with pages, catalogs, and messages sorted by key (by code unit), one section or message
per line, so diffs and merges stay small. A malformed file is an error, never guessed at or
overwritten; a newer version is refused. Writing one part (marking a page) keeps the others as
read. Fingerprints and their normalization are part of the format: changing either is a new
version.
