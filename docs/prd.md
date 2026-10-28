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
target language on the other, kept in sync, with first-class RTL support.

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
| Block | A structural unit of a document (heading, paragraph, list, code, image, component). Blocks are the unit of alignment. |
| Translation pair | A source document + its target counterpart (which may not exist yet). |
| Message catalog | A set of key → string messages for one locale (e.g. `i18n/he.json`). |
| Message | One key with its source text, target text, and documentation. |
| Format plugin | An adapter that knows how a specific system finds, reads, and writes translations. |
| Status | `missing` · `draft` · `translated` · `outdated` (source changed after translation). |

## 7. Core experiences

### 7.1 Project overview
- Open a folder. Paper Lion auto-detects the format(s) or reads the project config.
- Choose the source locale (default `en`) and the target locale.
- See a dashboard with longform documents and message catalogs, each with a status and progress
  (for example "12/40 pages, 310/420 messages").
- Filter by status. Missing and outdated items come first.

### 7.2 Longform parallel editor
- Split view: source pane (read-only by default) and target pane (editable). Each pane sets its own
  `dir`/`lang`.
- **Seed from source:** create a missing target by copying the source. Code blocks, images, links,
  and components are kept, and the prose is ready to overwrite.
- **Block-aligned sync:** scrolling, cursor, and selection in one pane follow the matching block
  in the other. Misaligned blocks (added or removed in one side) are highlighted.
- Frontmatter is edited as fields, with per-field "translatable or keep as-is" rules set by the plugin.
- Toggle between raw Markdown and a rendered preview per pane. Custom components get a placeholder
  render.
- RTL editing: correct caret movement with mixed-direction text, and Markdown syntax that stays legible.

### 7.3 Message catalog editor (banana-i18n first)
- A list or table of messages: key · source · target · status, with search and filters.
- A focused split editor for one message, with the documentation from `qqq.json` shown alongside.
- Validation: placeholders (`$1`, `$2`), `{{PLURAL:…}}`, `{{GENDER:…}}`, and wikitext-style
  links must stay consistent between source and target. Warnings are shown inline.
- Preserves `@metadata` (authors) and file formatting and key order on save.
- Shows keys that are missing in the target and orphaned keys that no longer exist in the source.

### 7.4 Saving
- Explicit save plus autosave of drafts. Writes are atomic.
- Round-trip guarantee: a file that wasn't edited is never rewritten. An edited file changes only
  where it was edited.
- External changes (git pull, another editor) are detected and offered for reload.

## 8. Format plugin system
Two plugin families share one registration mechanism:

- **Longform format** (`DocumentFormat`): detect the project, list source documents, resolve the
  target path for a locale, and give the translatable and keep-as-is rules for frontmatter.
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
- **M1: Read-only longform.** Open a VitePress project, list pairs with status, and show a static
  split view.
- **M2: Edit and save longform.** Seed from source, edit the target, and save with round-trip safety.
- **M3: Sync.** Block alignment, synced scroll and selection, and misalignment hints.
- **M4: banana-i18n.** Catalog list, split message editor, `qqq` docs, and validation.
- **M5: Second plugins.** Starlight + gettext `.po`, to prove the plugin contracts hold.

## 11. Open questions
- **Outdated detection:** how do we know the source changed after translating? Options include git
  history, a stored source hash in a sidecar file, or a frontmatter field. Which is least intrusive?
- **Alignment strategy:** match blocks by structure only, or let the user pin pairs manually?
- **Custom components in Markdown** (Vue in VitePress, MDX-like in Astro): how much preview is
  worth building?
- **Git awareness:** show diffs and branch info, or stay out of git entirely?
- **More than one target:** a three-pane view (source + two targets) someday?
- **Assistive translation:** an optional, pluggable MT or LLM suggestion provider behind a port, off
  by default?
- **Sidecar state:** where do drafts and status live: next to the project, or in app data?