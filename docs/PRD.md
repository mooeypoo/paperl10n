# Paper Lion: Product Requirements (draft v0)

> **paperl10n**, read and displayed as **Paper Lion**: *paper* for pages and documents, *l10n*
> (the numeronym for localization) read as "lion". Localizing your pages.
> - Dev identifier: `paperl10n` (repo, folder, npm scope `@paperl10n`, config file, app id).
>   The unscoped `paperl10n` package is reserved for a possible CLI.
> - Display name, window title, and accessible label: "Paper Lion".
> - Logo: a stylized wordmark playing on the l10n/lion swap, with a lion symbol.
> Status: raw draft for iteration. Architecture rules live in `AGENTS.md`.

## 1. Summary
Paper Lion is a local desktop app for translating a project's content side by side. Source on one side,
target language on the other, with the source always in view, and first-class RTL support.

It handles two kinds of translation work:
1. **Longform**: Markdown pages of static docs and sites (VitePress, Astro Starlight, Nuxt Content, …).
2. **Interface strings**: short UI messages in message catalogs, starting with **banana-i18n** JSON
   and later gettext `.po/.pot` and others.

How each system stores translations is handled by **format plugins**, so adding a new system means
adding a plugin, not rewriting the app.

## 2. Problem
- Translating docs sites today means juggling two editor tabs, matching file paths by hand, and
  scrolling two files independently while trying to keep your place.
- Every static-site system lays out translated files differently (folders per locale, suffixes,
  frontmatter flags), so the translator has to remember the rules.
- RTL languages are painful in most editors: mixed-direction text, punctuation that flips, and
  Markdown syntax that renders backwards.
- Interface-string files (banana-i18n JSON) are edited as raw JSON. Translators can't see the source
  text, the message documentation (`qqq`), or missing keys at a glance.

## 3. Goals
- Open a local project folder, choose source and target locales, and see what needs translating.
- Edit any translation in a split view with the source always visible and aligned.
- Write files back **exactly** where and how the target system expects them, without corrupting
  anything (round-trip safe).
- Work as well for RTL targets (Hebrew, Arabic, …) as for LTR targets.
- Add new formats through plugins with a clear contract.

## 4. Non-goals (for now)
- Hosting, accounts, or collaboration servers. It's local-first, files on disk are the truth.
- Replacing translatewiki.net, Weblate, or Crowdin for large community workflows.
- Being a general-purpose Markdown or code editor.
- Machine translation. It's a possible later addition (see §11), but not part of v1.

## 5. Users
- **Primary:** a maintainer (me) translating their own docs site and app strings, usually EN → HE.
- **Secondary:** open-source maintainers and volunteer translators who work with a local checkout.

## 6. Glossary (ubiquitous language)
| Term | Meaning |
|---|---|
| Project | A local folder the user opens, plus its Paper Lion config. |
| Locale | A language/region id (`en`, `he`, `pt-BR`) with a text direction. |
| Source / Target | The locale being translated from / into. |
| Longform document | A Markdown file (with frontmatter) representing a page. |
| Document key | The locale-independent identity of a longform document, such as `guide/getting-started`. The format plugin derives it from the file's path. A source document and its translations share a key, which is how translation pairs are found. |
| Block | A structural unit of a document (heading, paragraph, list, code, image, component). Blocks are the unit of **source-change tracking**: they say *where the source changed*, not where the translation must match. Pairing happens at the section level. |
| Translation pair | A source document + its target counterpart (which may not exist yet). |
| Message catalog | A set of key → string messages for one locale (e.g. `i18n/he.json`). |
| Message | One key with its source text, target text, and documentation. |
| Format plugin | An adapter that knows how a specific system finds, reads, and writes translations. |
| Section | The part of a longform document from one heading to the next heading of the same or a higher level. Sections are the unit Paper Lion **pairs** between source and translation; within a section the translation is free-form. |
| Status | `missing` · `draft` · `translated` · `outdated` (source changed after translation). For longform it applies to a **whole document** and to **each section**; for catalogs, to **each message**. `missing`: no translation (or, for a section, nothing paired with it). `draft`: never marked up to date. `translated` (shown as "up to date"): marked up to date, and the source is unchanged since. `outdated`: marked once, and the source changed since. |
| Mark up to date | The translator's explicit statement that a section, a page, or (once, for a project translated before Paper Lion) every existing translation matches the source as it is now. Never a side effect of saving. |
| Status file | `.paperl10n/status/<locale>.json` in the project, one per target language, committed with the translations: for each page, a fingerprint of each source block as it was when marked up to date. Never a published file. |
| Source change | A change in the source document since its translation was last marked up to date: a block changed, added, or removed. Shown on the source side, as a reference. Paper Lion knows which blocks changed, not their old wording. |
| Draft (unsaved edits) | A page's edits that aren't saved to its file yet, kept in Paper Lion's own data folder (never in the project) so a crash or a restart doesn't lose them. Not the `draft` status below. |
| Preservation hint | A neutral note that something usually kept as is (code blocks, link targets, images, components, frontmatter keys) appears a different number of times in a section of the translation, or the page. A hint, never an error. |

## 7. Core experiences

### 7.1 Project overview
- Open a folder. Paper Lion auto-detects the format(s) or reads the project config.
- Choose the source locale (default `en`) and the target locale.
- See a dashboard with longform documents and message catalogs, each with a status and progress
  (for example "12/40 pages, 310/420 messages").
- Filter by status. Missing and outdated items come first.

### 7.2 Longform parallel editor
- Split view: source pane (read-only by default) and target pane (editable). Each pane sets its own
  `dir`/`lang`. Both panes are Markdown editors (CodeMirror 6, decided in M2): the file's text is
  the document, so what's saved is exactly what was typed.
- **Seed from source:** "Start translating" opens a byte-for-byte copy of the source as unsaved
  changes. Code blocks, images, links, and components are kept, and the prose is ready to
  overwrite. The file (and any missing folders) is written on the first save, so starting and
  walking away leaves nothing behind.
- **Section view (default):** the document is split into **sections at its headings**, and source
  and translation sections are paired in order. The two editors are aligned so each pair of
  headings sits side by side, so the translator always sees which part of the source they're
  working on. Progress counts sections ("Sections up to date: 3 of 5"), and each section shows its
  status at its heading, with "Mark up to date"; the page has "Mark page up to date".
- **The split level** is the shallowest heading level in the source's body (usually `##`), except
  that a lone `# Title` over the sections doesn't count. The text before the first heading at that
  level is the intro, and the frontmatter is its own part; both pair by place. Deeper headings stay
  inside their section, and a long section without subheadings stays one section. Only real
  headings count (not a `#` line in code, a list, or a quote; headings inside `:::` containers do).
  The translation is split at the same level. Changing the level for one document is deferred
  until a real site needs it (see §11).
- **The view is chosen when the page opens.** Sections that pair open the section view. When they
  don't (the translation has a different number of headings at that level, or they're at a
  different level), the page opens in the full-page view with a note saying why. It never guesses
  a pairing. While editing, the view stays as it opened: if the sections stop matching, a note says
  so, and the page is paired again when it's reopened.
- **Full-page view (secondary):** both whole documents side by side, for reading the flow or for
  translations that are deliberately structured differently.
- **Status is explicit.** A page or section becomes up to date only when the translator marks it,
  never on save. A project translated before Paper Lion starts with every translation as a
  draft, and the page list offers, once, to mark all existing translations up to date. Marking is
  refused if the source changed on disk since the page was opened, so a version the translator
  hasn't read is never marked. A status file that can't be read (a merge conflict, say) never
  stops work: the page list says why, and marking waits until it's fixed.
- **Within a section, the source is a reference, not a template.** A translation may split, merge,
  reorder, or restructure paragraphs and lists. Paper Lion never claims that a paragraph, block,
  or line is "missing" or "extra", and never pushes toward the same structure, word count, or line
  count.
- **Source changes:** when the source changed after the translation was last marked up to date,
  the changed and new blocks are highlighted **in the source pane** (a tint and a line mark, solid
  for changed and dashed for new), and a marker shows where text was removed, so the translator
  knows what to revisit. A changed section says so at its heading. Nothing is marked in the
  translation: what to change there is the translator's call.
- **Preservation hints:** neutral notes about things usually kept as is whose counts differ between
  a source section and its pair (or the whole page, in the full-page view or when sections don't
  pair): code blocks (by language, not contents), link and image targets, components (by tag
  name), and frontmatter keys. They follow the translation as it's typed. Link targets are
  compared in the source's form: the format plugin can map a localized link (`/he/guide/`) back to
  the source's (`/guide/`); without that, links compare as written.
- **Length, as information only:** a page-level comparison of the rendered text's length, in
  characters (for example "About 20% of the source's length"), useful for spotting an obviously
  unfinished translation. Never per block or section, never a warning threshold: lengths differ
  naturally between languages.
- **Scrolling:** in a window wide enough for the panes side by side, each pane scrolls on its own.
  In the section view they're locked together, paired headings level. In the full-page view they
  sync loosely: paired headings line up as they pass, and otherwise relative position. A "Scroll
  together" toggle (on by default) turns that off. It's a navigation aid, not a correctness check.
- Frontmatter is part of the editable text today (M2: the whole file is edited as text). Later,
  it's edited as fields, with per-field "translatable or keep as-is" rules set by the plugin.
- Toggle between raw Markdown and a rendered preview per pane. Custom components get a placeholder
  render (planned).
- RTL editing: correct caret movement with mixed-direction text, and Markdown syntax that stays
  legible. Prose lines take the pane's direction (or their own, per line), code and frontmatter
  lines are LTR, and inline syntax is isolated so it can't reorder the sentence around it. HTML
  and component blocks, tables, and `:::` fences read line by line; inline code, URLs, and tags
  are each one left-to-right run.
- **Visual editing, as live preview:** translators edit sections, or the full page, as formatted
  text instead of writing Markdown by hand. Formatting and especially **links are inserted with
  controls**, not typed syntax. This matters most in RTL: a raw `[text](url)` in the middle of a
  Hebrew or Arabic sentence can visually reorder the sentence, because of the bidi algorithm. The
  editor isolates link targets and inline syntax from the surrounding text so that can't happen.
  Markdown stays the file format: visual edits become minimal Markdown changes, under the same
  round-trip guarantee. It grows as live-preview decorations on the M2 Markdown editor, not as a
  separate rich-text editor. Built so far (M2):
  - Away from the caret, Markdown that only says how text looks is hidden: a link shows as its
    text and a small link chip; `**`, `_`, `~~`, inline code's backticks, and a heading's `#`s are
    hidden, and the text keeps its look. Where the caret or a selection touches an element, its
    Markdown shows again.
  - Links are edited in a dialog, opened from the chip or with Ctrl/Cmd+K (which also adds a
    link): the text in the pane's language, the target always left to right. Applying changes
    only what changed.
  - Structure (lists, quotes, tables, code fences), HTML, and components stay as written. Images
    and components may get previews later (see §11).

### 7.3 Message catalog editor (banana-i18n first)
- A list or table of messages: key · source · target · status, with search and filters.
- A focused split editor for one message, with the documentation from `qqq.json` shown alongside.
- Validation: placeholders (`$1`, `$2`), `{{PLURAL:…}}`, `{{GENDER:…}}`, and wikitext-style
  links must stay consistent between source and target. Warnings are shown inline.
- Preserves `@metadata` (authors) and file formatting and key order on save.
- Shows keys that are missing in the target and orphaned keys that no longer exist in the source.

### 7.4 Saving
- **Explicit save:** Save, or Ctrl/Cmd+S from anywhere in the window (on any keyboard layout).
  Writes are atomic.
- **Drafts:** unsaved edits are kept automatically, shortly after typing pauses, as a draft in
  Paper Lion's own data folder, never in the project. After a crash or a restart, the page opens
  with them, says they were restored, and offers to discard them. Pages with drafts are marked in
  the page list. Saving, undoing back to the file, or leaving without saving forgets the draft.
- **Leaving with unsaved changes** (another page, project, or target language, or closing the
  window) asks first: save, don't save, or stay.
- Round-trip guarantee: a file that wasn't edited is never rewritten. An edited file changes only
  where it was edited, keeping its line endings, byte order mark, and final newline. Saving text
  identical to the file writes nothing.
- **External changes** (git pull, another editor) are checked on save: a file that changed on disk
  since editing started is never overwritten silently. Paper Lion asks: keep editing, reload the
  file (dropping the edits), or overwrite it with the edits. Watching files for changes while
  editing comes later.

## 8. Format plugin system
Two plugin families share one registration mechanism:

- **Longform format** (`DocumentFormat`): detect the project, list source documents, resolve the
  target path for a locale, and give the translatable and keep-as-is rules for frontmatter.
  Optionally, map a translation's link target to the source's form, for preservation hints.
  - Initial: VitePress, Astro Starlight. Later: Nuxt Content, Docusaurus, plain folder-per-locale.
- **Catalog format** (`CatalogFormat`): locate catalogs, parse a catalog into messages, serialize
  messages back, and declare its placeholder or plural syntax for validation.
  - Initial: banana-i18n JSON (incl. `qqq`). Later: gettext `.po/.pot`, i18next JSON, Fluent, XLIFF.

Principles:
- Core code knows only the contracts, never a specific system.
- Plugins are pure adapters behind ports and testable with fixture projects.
- Built-in plugins first. Third-party or user-defined plugins (and a declarative "describe your
  layout in config" plugin) come later.
- Package naming: `@paperl10n/format-<system>` for longform formats (e.g. `format-vitepress`) and
  `@paperl10n/catalog-<system>` for catalog formats (e.g. `catalog-banana`, `catalog-gettext`).
  Built-in plugins use the same names from day one, even before they're published separately,
  so extracting one later is a move, not a rename.
- Project config (e.g. `paperl10n.config.json`) can pin formats, locales, and paths when
  auto-detection isn't enough.

## 9. Non-functional requirements
- **Local-first:** fully usable offline. No telemetry by default.
- **Safety:** no data loss. Atomic writes and round-trip tests for every plugin.
- **RTL and BiDi:** logical CSS only, correct mixed-direction rendering, and the app UI itself
  localizable (eventually translatable with Paper Lion).
- **Performance:** a docs site with ~1,000 pages and catalogs with ~5,000 messages stay responsive.
- **Decoupled UI:** the Vue UI is a replaceable adapter over use cases.
- **Security:** a sandboxed Electron renderer and a typed IPC contract only.

## 10. Milestones (rough)
- **M0: Skeleton.** Electron + Vue + TS, domain folders, lint boundaries, CI, fixture projects.
- **M1: Read-only longform.** Open an Astro Starlight project, choose source and target locales (design
  discussion first: `docs/plan/M1-languages.md`), list pairs with status, and show a static
  split view.
- **M2: Edit and save longform.** Seed from source, edit the target, and save with round-trip safety.
  Done, including the first live-preview steps (links with a chip and a dialog; emphasis, code,
  and heading marks hidden away from the caret). Decisions and step notes in
  `docs/plan/M2-editing.md`.
- **M3: Sections, changes, and hints.** Section view with per-section status and progress, the
  full-page view, source-change highlighting, preservation hints, the length comparison, and loose
  scroll sync. Done, except changing the split level per document (deferred). Decisions and step
  notes in `docs/plan/M3-sections.md`.
- **M4: banana-i18n.** Catalog list, split message editor, `qqq` docs, and validation.
- **M5: Second plugins.** VitePress + gettext `.po`, to prove the plugin contracts hold.

## 11. Open questions
- ~~**Visual editing approach**~~ **Decided in M2:** live-preview decorations on a CodeMirror 6
  Markdown editor, so Markdown stays the single source of truth and round-trip safety holds by
  construction. A spike over bidi samples confirmed it; ProseMirror/Tiptap was the fallback.
- ~~**Outdated detection**~~ **Decided in M3:** a status file in the project, one per target
  language (`.paperl10n/status/<locale>.json`), committed with the translations, holding a
  fingerprint of each source block from when it was marked up to date. It never touches a
  published file and works without git. It shows which blocks changed, not their old wording;
  showing that from git could come with git awareness.
- **Finer-grained pairing (revisit later):** pairing below the section level (paragraphs or
  blocks) for projects that want strict structural parity. Deliberately not a starting point:
  sections are paired, and the text within them is free.
- ~~**Section split level**~~ **Decided in M3:** the rules in §7.2 (the shallowest level, a lone
  title skipped, an intro, deeper headings and long sections kept whole). Still open: whether a
  real site needs the level changed per document (it would be stored in the status file, so it's
  shared).
- **Custom components and images in the live preview** (Vue in VitePress, MDX-like in Astro):
  chips, thumbnails, or a placeholder render? How much preview is worth building?
- **Git awareness:** show diffs and branch info, or stay out of git entirely?
- **More than one target:** a three-pane view (source + two targets) someday?
- **Assistive translation:** an optional, pluggable MT or LLM suggestion provider behind a port, off
  by default?
- ~~**Sidecar state**~~ **Decided:** status lives next to the project, in its status file
  (M3), so it's shared with co-translators; drafts live in app data, never in the project (M2).