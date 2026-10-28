# Sample docs project

A small, realistic documentation site for trying Paper Lion by hand: open this folder with
**Open folder…** in `pnpm dev`, or run `pnpm dev:harness` (it opens this project by default).

It's sample content, not a test fixture: edit it freely to try things out. Tests use the plugin
fixtures in `src/plugins/*/fixtures/` instead.

The docs are about **Lantern**, a made-up static-site tool. Sources are in `docs/en/`, Hebrew
translations in `docs/he/`, as `format-stub` expects (one folder per locale, under `root: "docs"`).

## What's in it

| Source (`docs/en/`) | Hebrew (`docs/he/`) | Exercises |
|---|---|---|
| `index.md` | translated | frontmatter (title, description, hero), short sections |
| `guide/getting-started.md` | translated | code blocks, lists, links, a component, English terms and paths inside Hebrew |
| `guide/configuration.md` | **partly translated**: the last section is missing, and one section predates a source change | a table, JSON, inline code |
| `guide/writing-content.md` | **missing** | images, nested lists, emphasis, a link in the middle of a sentence |
| `reference/cli.md` | **missing** | many headings, flags, long code blocks |
| `reference/glossary.md` | translated | a definition list as a table, numbers and units in RTL |
| `blog/2026-10-lantern-2.md` | **missing** | blog frontmatter (date, author, tags) |
| `about.md` | **missing** | a short page with no headings |

Not translated on purpose: `docs/he/` has no `blog/` folder at all.

The tricky bits for right-to-left text: Hebrew sentences that contain English product names,
file paths, inline code, numbers with units (`5 MB`, `v2.1`), links, and punctuation at the end of
a line that ends in an English word.

Some Hebrew paragraphs that start with an English word (`‏Lantern …`) begin with an invisible
right-to-left mark (U+200F), as Hebrew writers often add, so the paragraph's direction is
detected as RTL. An editor has to keep it.

Paper Lion doesn't show translation status yet, so for now both panes list every document's path,
whether or not the Hebrew file exists. Status, section pairing, and editing come in M1 and M2.
