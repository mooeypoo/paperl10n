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

## Later (M3)

Status (missing, draft, translated, outdated), block fingerprints in a status file per target
language, marking up to date, source-change highlighting, preservation hints, and the length note.
