# Domain: `document`

Longform Markdown documents: their identity, their structure, and (from M2) their edits. Code:
`src/domains/document/`. Other code imports `#domains/document`.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Document key | The locale-independent identity of a document (`guide/getting-started`), shared by a source and its translations. |
| Parsed document | A document as read: its exact `text`, its `blocks`, its `inline` spans, and its `preserved` elements. Positions only, never a re-printed tree. |
| Block | A top-level structural unit: frontmatter, heading, paragraph, list, blockquote, code, table, html, thematic break, link definition, container fence, or MDX import/export. Blocks are the unit of source-change tracking (M3), not of pairing: translations pair by section (PRD §7.2). |
| Inline span | A part of the text a view styles differently from prose: `markup` (syntax characters), `code`, or `url` (link destinations). |
| Preserved element | Something a translation usually keeps as is (PRD §6, preservation hints), with the value compared: a `code-block` (its language), a `link` or `image` (its target), a `component` (its tag name), or a `frontmatter-key`. |
| Text range | A `start`–`end` span in **UTF-16 code units** (JavaScript string indices, the editor's unit), end exclusive (`#kernel/text-range`). |
| Frontmatter | A YAML (`---`) or TOML (`+++`) block at the very start, after an optional BOM. |

## Invariants

Checked for every parse by `parsedDocumentProblems`, and by the parser contract suite:

- **The text is kept exactly.** A parse never changes, normalizes, or re-prints the text: line
  endings, BOM, tabs, and bidi marks (U+200E/U+200F, U+2066–U+2069) stay as they are. Edits
  (M2) will be splices at block offsets, so an unedited document is its original bytes.
- **Blocks are in order and never overlap.** Only whitespace (or a leading BOM) lies between or
  around them. A block's range excludes its own line ending, including the CR of CRLF.
- **Inline spans are in order, never overlap, and lie inside a block.**
- **Preserved elements are in order of their start and lie inside a block.** They may nest (an
  image inside a link).
- **Only headings have a depth** (1–6).
- **Parsing is stable:** the same text always gives the same result.

## The parser

`MarkdownParser` (`document/application/ports/`) is the port: `parse(text, { mdx })` →
`ParsedDocument`, pure and synchronous. The implementation is `createLezerMarkdownParser()`
(`#adapters/document/lezer-markdown-parser`), on `@lezer/markdown` (CodeMirror 6's parser), with
CommonMark plus GFM tables, task lists, and strikethrough, and two additions:

- **Container fences:** a line starting with `:::` (VitePress `::: tip`, Starlight `:::note`) is a
  `container-fence` block; the content between fences parses as ordinary Markdown.
- **MDX tolerance** (`mdx: true`, for `.mdx` files): top-level `import`/`export` statements, up to
  the next blank line, are opaque `mdx-esm` blocks.

The Lezer configuration for both additions lives in `#markdown-syntax` (`src/shared/markdown-syntax/`,
[ADR 0017](../adr/0017-shared-markdown-syntax.md)), so the M2 editor in the renderer parses the
same dialect. The adapter maps Lezer's node names to blocks and inline spans.

**Preserved elements** come from the same tree:

- **Links:** inline links, autolinks, and link definitions (`[ref]: /x`), each with its URL. A
  reference-style use (`[text][ref]`) has no target of its own; its definition counts.
- **Images**, with their URLs.
- **Code blocks:** fenced, with the first word of the info string as the language (`ts` for
  ` ```ts title="a.ts" `), or indented, with none. Inline code isn't preserved (it's often prose).
- **Components:** each opening tag (`<Badge`, `<kbd>`, `<Card`), inline or in an HTML block, by
  name. Closing tags and comments aren't counted.
- **Frontmatter keys:** top-level only: YAML `key:` lines without indentation (quoted keys without
  their quotes), or TOML `key =` lines and `[table]` headers. Read by `frontmatterKeys` in
  `document/domain/`, without a YAML library.

Nothing is found inside code blocks.

**Known deviations from CommonMark** (lezer's), kept in the contract so a parser swap shows up:

- A component or unknown tag alone on a line (`<Badge text="New" />`) is a paragraph holding an
  inline tag, not an HTML block. Known HTML block tags (`<div>`) are HTML blocks. Inline tags are
  marked as `markup` either way.
- `#` followed by a tab isn't a heading (`# ` with a space is).

Swapping the library touches only `document/adapters/` and must pass the same contract suite
(`describeMarkdownParserContract`, `#domain-testing/document`).

## Later

- M2: edits as text splices, frontmatter fields (with a CST-preserving YAML library).
- M3: sections and their pairing are `translation`'s ([its doc](translation.md)), over these blocks;
  source-change tracking on blocks.
