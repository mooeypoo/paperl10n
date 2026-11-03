# M5 discussion: second plugins (VitePress and gettext)

Status: **decided (2026-11-03): every question as recommended.** See [Decided](#decided). The
discussion follows, for context.

PRD M5: "VitePress + gettext `.po`, to prove the plugin contracts hold." Each contract has one
real plugin today: `DocumentFormat` has Starlight, and `CatalogFormat` has banana-i18n. A second
plugin for each shows which parts of a contract were really banana-i18n's or Starlight's. Where a
contract has to change, that's the finding. The change is made deliberately, in the plugin API
(a new `apiVersion` if it breaks anything), and never by core code learning a format's name.

The two plugins are independent. **VitePress is small**, because Starlight already exercised
nearly everything it needs. **gettext is large**, because its messages aren't shaped like
banana-i18n's. Two parts, in that order.

## Decided

The maintainer took every recommendation (2026-11-03):

| Topic | Decision |
|---|---|
| Config reader (V1) | **A static object-literal reader in `#plugin-api`**, moved from Starlight and used by both plugins. |
| VitePress layout (V2) | `srcDir` from the config, overridable by an option. `.md` pages. Starlight's order for locale folders. `rewrites`, `srcExclude`, and a config's `dir` are left for later. |
| VitePress Markdown (V3) | No dialect change. The fixtures cover each row of the table. |
| Links and detection (V4, V5) | Starlight's rule plus `.md` and `.html` suffixes. `.vitepress` at the root or one level down. |
| Source and key (G1) | The key is `msgctxt` + `msgid`. The source is the template, else the source locale's `.po`, else the target's own `msgid`s. `parse` takes a role. |
| Plurals (G2) | `Message` gains `forms`, with one editor field per form, labeled from the target's `Plural-Forms` (an evaluator in the plugin). A new file's `Plural-Forms` comes from a table generated from CLDR, as `locale`'s data is. Its source and license are checked when it's built. |
| Documentation (G3) | `Message` gains `documentation` (from `#.`). A documentation file still wins when there is one. |
| Fuzzy (G4) | Reads as `outdated`. Saving or keeping clears it. The old source from `#|` is shown when known. |
| Placeholders (G5) | `scan` gets the message, and scans by the entry's flags. |
| Layouts and encoding (G6) | Side by side and folder per locale. gettext locale names are mapped to BCP 47 in the plugin. Non-UTF-8 files are refused. |
| Writing (G7) | `msgmerge`'s style. New entries take the template's comments. A new file gets a fresh header. An existing header stays as it is. An emptied translation becomes `msgstr ""`. A removed entry becomes obsolete (`#~`). |
| UI (G8) | Forms in the editor, "Needs review" with the old source, and context with the key. The banana-i18n preview stays banana-i18n's. |
| Real projects | Fixtures shaped like VitePress's own docs, a Django app, and a GNOME app. |
| `msgmerge`-like updates | Not in M5. |

## Where M4 left us

- **`DocumentFormat`** has Starlight (`format-starlight`) and the stub. Starlight reads its
  `astro.config.*` statically (`astro-config.ts`, never run), maps BCP 47 locales to folders, and
  maps localized links back for the hints (`sourceLinkTarget`).
- **`CatalogFormat`** (plugin API v3) has banana-i18n. A message is `{ key, text }`: one key,
  one string. The documentation is a separate file (`qqq.json`), listed on `SourceCatalog`.
  `placeholders.scan(text)` sees only the text. Status comes from the status file's fingerprints.
  Validation compares the tokens by kind.
- **The plural and gender preview** (C8) renders banana-i18n syntax in the renderer. It shows only
  when main's tokens include a `plural` or `gender`.
- **Plugins can't share code.** Each imports only `#plugin-api`, so a second plugin that reads a
  JavaScript config would copy Starlight's reader.

---

## Part 1: VitePress (`format-vitepress`)

VitePress keeps Markdown under the source folder (the project root, or `srcDir`). Each non-root
locale is a folder named by its `locales` key, and the `root` locale is at the top. This is
Starlight's layout with different config. The config is `.vitepress/config.{js,ts,mjs,mts}`, and
`.vitepress` sits in the site's root (often `docs/`).

### V1. Reading the config: copy Starlight's reader, or share one

`astro-config.ts` reads a `locales` object literal without running the config. VitePress needs the
same thing, plus `srcDir`. VitePress's `locales` entries also carry `dir` (`'rtl'`), which is worth
reading.

| Option | Notes |
|---|---|
| **A. A static object-literal reader in `#plugin-api`** (recommended) | Moved from Starlight, generalized: find a top-level property (`locales`, `srcDir`) and read plain literals; anything dynamic gives `null`. Both plugins use it. It's a non-breaking addition to the plugin API (frozen export list: a deliberate diff). |
| B. A copy in each plugin | Self-contained, as plugins are meant to be, but two readers drift, and every later JS-configured site (Docusaurus, Nuxt) copies it again. |
| C. A JS parser dependency (acorn) in the plugin's `externalDependencies` | Correct for any syntax, but a new dependency for a problem the small reader already solves for plain configs. |

**Recommendation: A.** The plugin API is the place for helpers every plugin may need. Its
README would say what it reads and what it refuses.

### V2. Layout details

- **The source folder:** `srcDir` from the config (relative to the folder holding `.vitepress`),
  else that folder. The plugin's `srcDir` option overrides it, as Starlight's `contentDir` does.
- **Pages:** `.md` only (VitePress has no MDX). Skip `.vitepress/`, `public/`, and `node_modules/`.
  Honoring `srcExclude` globs is left for later; until then, the option covers it.
- **Locale folders:** the same order as Starlight. The plugin's `localeFolders` option comes
  first, then the config's `locales` (the key is the folder, `root` is none, `lang` is the
  locale), then an existing folder ignoring case, then the lowercase id.
- **`rewrites`:** a rewrite changes which URL a file serves, not where its translation lives, so
  pairing doesn't need it. Links under a rewritten path compare as written. **Recommended:**
  ignore `rewrites` in M5 and note it in the README.
- **Direction:** a locale's `dir: 'rtl'` in the config. Paper Lion already knows each language's
  direction from its own catalog. **Question:** should a project's declared `dir` override it?
  Recommended: no in M5. It would need `ProjectLocale` to carry a direction, which is an API
  change for a case the catalog already gets right.

### V3. VitePress's Markdown

VitePress adds syntax on top of what the editor parses (GFM, `:::` containers, ADR 0017):

| Syntax | Today | Recommendation |
|---|---|---|
| `::: info Title` containers, `::: details`, `::: code-group` | parsed (containers) | Nothing to do. |
| `{{ $frontmatter.title }}` interpolation, `<script setup>`, `<style>` | text / HTML blocks | A preservation hint for `{{ … }}`? Recommended later: count it with components once a page shows the need. |
| `[[toc]]`, `:emoji:` | text | Nothing. |
| `<<< @/snippets/file.js` (code import), `<!--@include: ./part.md-->` | text / HTML comment | Nothing in M5. An included file isn't a page, so it's translated only if it sits under a locale's folder. Noted in the README. |
| Line highlights in fences (```` ```js{4} ````), `// [!code ++]` | fence info / code | Nothing; code is code. |
| Home page `layout: home` with `hero:` and `features:` in frontmatter | frontmatter, edited as text | Nothing in M5. All of a home page's text is frontmatter, which makes the "frontmatter as fields" follow-up more valuable. |

**Recommendation:** no dialect change in M5. The fixtures include each row, and the round-trip
tests prove those pages are kept byte for byte.

### V4. Links (`sourceLinkTarget`)

VitePress serves a locale's pages under its key (`/he/guide/`). A `link` in the config only sets
the navbar's language menu, not where pages are served. The rule is Starlight's (drop or swap the
first segment), plus `.md` and `.html` suffixes, which VitePress links often have
(`./guide.md`, `/he/guide.html`). Relative links compare as written. **Recommended:** as
Starlight, and a site `base` is still not known.

### V5. Detection

`certain`: a `.vitepress/config.*` file that mentions `vitepress` (or `defineConfig` from it).
`likely`: a `.vitepress/` folder with any config. Search for `.vitepress` at the root and one level
down (`docs/.vitepress`), which covers nearly every site; a deeper site pins the format.

---

## Part 2: gettext (`catalog-gettext`)

A `.po` file is a list of entries, each with:

```po
# Translator's comment
#. Extracted comment: the developer's note to translators
#: src/main.c:42
#, c-format, fuzzy
#| msgid "Delete %d file"
msgctxt "menu"
msgid "Delete %d file"
msgid_plural "Delete %d files"
msgstr[0] "מחק קובץ %d"
msgstr[1] "מחק %d קבצים"
```

The empty `msgid ""` is the header (`Language`, `Plural-Forms`, `Content-Type`, …). Obsolete
entries are `#~` lines. The template (`.pot`) has the same entries with empty `msgstr`s. Several
things here have no banana-i18n counterpart, and each is a contract question.

### G1. The source and a message's key

In gettext, **the source text is the key** (`msgid`), together with `msgctxt` when there is one.
A changed source string becomes a new key, and the old translation is either dropped or carried
over by `msgmerge` as **fuzzy**, with the old source in `#|`. The source catalog is the template
(`.pot`), and many projects commit one. Others (Django) don't: each `.po` is generated from the
code, and carries the source text itself in its `msgid`s.

| Option | Notes |
|---|---|
| **A. The key is `msgctxt` + `msgid`** (joined as gettext does, with `\u0004`), **and the source is the template when there is one, else the source locale's `.po`, else the target's own `msgid`s** (recommended) | Matches the system. A target `.po` alone is enough to translate, because the source text is in it. Without a template, a message the target doesn't have yet can't be known, which is also true of gettext itself. |
| B. Require a template | Simpler, but a Django project without one couldn't be opened. |

The parsed source message's **text** is its `msgid` (the source text), not its empty `msgstr`.
So `parse` needs to know whether it's reading a template. **Contract change:** a `role`
(`'source' | 'target'`) passed to `parse`, or the plugin's own `SourceCatalog` marks the template.
Recommended: `parse(text, { role })`.

### G2. Plurals: a message with several forms

`msgid_plural` with `msgstr[0]`…`msgstr[n-1]`, where `n` is the target's `nplurals` from its
`Plural-Forms` header. banana-i18n keeps plurals inside one string, so `Message` has one `text`.

| Option | Notes |
|---|---|
| **A. `Message` grows optional `forms`** (`text` stays the first form, `forms` lists them all) and the editor shows one field per form, each labeled with sample numbers (recommended) | Validation runs per form. A form left empty is missing. The plural's source is `msgid` and `msgid_plural`, shown together. It's breaking for plugins (API v4), which is what M5 is meant to find. |
| B. A plural as several messages (`key[0]`, `key[1]`) | No contract change, but the editor, status, and validation would see unrelated messages, and the forms couldn't be shown together. |
| C. Plurals read-only in M5 | Leaves out the main reason to use gettext's plurals. |

**Labels for the forms** come from the target's `Plural-Forms` formula, evaluated for sample
numbers (`plural=(n==1 ? 0 : n==2 ? 1 : 2)` gives "1", "2", "3, 4, 5…"). That's a small evaluator
for gettext's C-expression subset, inside the plugin, never `eval`. **A new file's
`Plural-Forms`** needs each language's formula. There are three sources: a table in the plugin
generated from CLDR (as `locale`'s data is), the `Plural-Forms` of another `.po` in the project,
or asking. Recommended: the CLDR-generated table, so the plugin works offline and for any
language. Its data source and license get checked first, and adding it is a dependency decision
for the maintainer.

**Contract change:** the plugin reports, for a locale, how many forms there are and a label for
each (`pluralForms(locale)`, or read from the parsed target). Core code never evaluates a
gettext formula.

### G3. Documentation and other comments

The developer's notes are `#.` comments on each entry, in the template, not a separate file.
`#:` references (file:line) help too.

**Recommendation:** `Message` grows optional `documentation` (the plugin joins the `#.` lines,
and maybe adds the `#:` references as a line under them). Pairing takes a documentation file's
text when there is one (banana-i18n), else the source message's own. Translator comments (`#`)
are kept on save and not shown in M5.

### G4. Fuzzy: gettext's own "outdated"

`#, fuzzy` means the translation was carried over from an older source and needs review, and
`#|` holds that older source. Every gettext tool reads it, so a project shares it with other
translators through the files themselves.

| Option | Notes |
|---|---|
| **A. Fuzzy reads as `outdated`, whatever the status file says, and saving a translation removes the flag and the `#|` lines** (recommended) | It's what the file means, and what other tools expect. When `#|` has the old source, the open message can show what changed (the source-change view pages have, for one message). "Keep as up to date" also clears the flag. |
| B. Ignore fuzzy; only the status file counts | Throws away the system's own signal, and a translation another tool marked for review would read as up to date. |

The status file still records saved messages, as for banana-i18n. For gettext, a source change
already shows as a new key, so the record mostly guards against a template edited in place.
**Contract change:** `Message` grows an optional `needsReview` (and `previousSource`).
`serialize` clears them on a set. Recommended names are generic, not gettext's.

### G5. Placeholders depend on the entry's flags

`c-format` marks `%s`, `%d`, `%1$s`; `python-format` marks `%(name)s`; `python-brace-format` marks
`{name}`. Without a flag, `%` and `{` are often plain text ("100%", JSON examples). Today
`placeholders.scan(text)` sees only the text.

**Recommendation:** `scan(text, message)` gets the source message, or just its flags, so the
plugin scans by the entry's format. Without a flag, it marks nothing but tags. This is part of
the same API v4 as G2. The token kinds stay as they are: printf and brace placeholders are
`parameter`s compared by their text, and `%1$s` and `%s` for the same argument aren't matched
(a refinement for later).

### G6. Layouts and locale names

| Layout | Files | Seen in |
|---|---|---|
| Side by side | `po/myapp.pot`, `po/he.po`, `po/pt_BR.po` (maybe `po/LINGUAS`) | GNU, GNOME, meson |
| Folder per locale | `locale/he/LC_MESSAGES/myapp.po`, a domain per file, maybe `locale/myapp.pot` | Python, Django (`django.po`, `djangojs.po`), Sphinx |

The catalog key is the domain (the file's base name), as C1 planned. gettext names locales as
`ll_CC` and `@modifier` (`pt_BR`, `sr@latin`), which map to BCP 47 (`pt-BR`, `sr-Latn`). The
plugin owns that mapping, and `targetPathFor` writes the system's name. Detection finds `.po`
and `.pot` files (excluding `node_modules`), and the `dirs` and `domains` options pin what a
scan gets wrong. A `po/` folder with no template and no source-locale `.po` reads each target's
own `msgid`s (G1).

**Encoding:** `ProjectFiles` reads UTF-8 only. A `.po` declaring another charset is refused with
`formats.invalid-catalog`, naming the charset. Recommended: keep that in M5. Nearly every current
project uses UTF-8.

### G7. Writing a `.po` file

The round-trip rules hold: an untouched file isn't rewritten, and an edited one changes only the
edited entries.

- **A changed `msgstr`** is written in the style `msgmerge` would write it (wrapped at 79
  columns, split after each `\n`, C-escaped), so the project's next `msgmerge` run makes no diff.
- **A new entry** (from the template, missing in the target) goes after the nearest preceding
  entry the target has, with its comments and flags copied from the template, as `msgmerge` does.
- **A new file** is written from the template with a fresh header: `Language`, `Plural-Forms`
  (G2), and `Content-Type: text/plain; charset=UTF-8`. The other header fields are copied, with
  `PO-Revision-Date` and `Last-Translator` left empty.
- **The header** of an existing file is left as it is. Updating `PO-Revision-Date` and
  `Last-Translator` is the same question as banana-i18n's `@metadata.authors` (PRD §11).
- **An emptied translation** becomes `msgstr ""` (gettext's "untranslated"), not a removed entry.
  This differs from banana-i18n, where an absent key falls back to the source.
- **Entries the template no longer has** are listed apart, as banana-i18n's are. Removing one
  writes it as obsolete (`#~`), as `msgmerge` does. **Question:** delete instead? Recommended:
  obsolete, which matches gettext and keeps the translation recoverable.

### G8. What else the UI needs

- **Several forms in the editor** (G2): one CodeMirror field per form, each labeled, and the
  warnings per form.
- **The plural and gender preview** is banana-i18n's renderer. A gettext plural is structural, so
  scanning never yields a `plural` token, and the preview stays hidden by construction.
  **Recommended:** keep it that way, and note in the code that the preview is banana-i18n's. A
  capability (the plugin says "previewable") comes if a third format needs one.
- **Fuzzy** (G4): the open message shows "Needs review" and, when it's known, the old source with
  the change marked.
- **Context** (`msgctxt`): shown with the key, since two messages can share a `msgid`.

---

## Architecture

- **`formats`:** plugin API v4. `Message` gains `forms`, `documentation`, `needsReview`,
  `previousSource` (all optional). `parse` takes a role, `scan` takes the message, and a catalog
  layout can describe a locale's plural forms. Plus the static config reader in `#plugin-api`
  (V1). The contract kit gains checks for plural forms (round trip, writing one form), for the
  flags cleared on a set, and for documentation coming through. Each new check gets a broken
  plugin, as before.
- **`catalog`:** pairing takes per-message documentation, and checking runs per form.
  **`translation`:** a message needing review is `outdated`.
- **`workspace` and IPC:** the DTOs carry forms, documentation, review state, and the previous
  source. Saving takes forms.
- **`src/plugins/format-vitepress/`** and **`src/plugins/catalog-gettext/`**, each with fixtures
  of real project shapes. VitePress: root and folder locales, `srcDir`, a `docs/.vitepress` site,
  and pages using each row of V3's table. gettext: side by side with a template, folder per locale
  (Django-like, no template), plurals in Hebrew and Arabic, fuzzy with `#|`, `msgctxt`, obsolete
  entries, long wrapped strings, and a non-UTF-8 file.
- **`catalog-banana`** moves to API v4 with no behavior change. Its documentation still comes from
  `qqq.json`.

## Proposed steps (after the decisions)

VitePress first: it's small, and it shows quickly whether the document contract holds.

- **V1, the config reader:** moved into `#plugin-api`, with Starlight using it (no behavior change;
  its tests unchanged).
  - *Done-notes:* `findStaticProperties(text, name)` in `formats/domain/static-config.ts`,
    exported from `#plugin-api` with `StaticValue` and `StaticProperty` (the frozen export list
    gains it), and described in [the formats doc](../domains/formats.md).
    - **A value tree, not Starlight's rules.** Starlight's reader looked for the first
      `locales: {` and only a `lang` string inside. VitePress needs more: its own docs build
      locale entries with spreads (`{ label: 'English', ...en }`), and its search options carry
      another `locales` deeper in. So the reader returns every property with the name and how
      deeply it's nested, and reads values into a tree: literals, objects and arrays marked
      incomplete when a part can't be read, and `dynamic` for the rest. Each plugin decides what
      a dynamic or incomplete value means.
    - **Starlight** (`astro-config.ts`) now uses it: the first `locales` object, which must be
      complete, each locale an object, and `lang` a string when present. Its tests are unchanged,
      plus one: Starlight's locales after Astro's own `i18n.locales` array. Two small differences:
      a `lang` with escapes is now decoded rather than refused, and a `locales:` that isn't in a
      property position (a ternary, a `case`) is no longer matched.
    - Tests: 42, table-driven: each kind of literal and escape, what's dynamic, what's
      incomplete, objects and arrays that never close, finding by name and depth, quoted keys,
      and what isn't a property (strings, comments, values, members, longer names, conditionals,
      shorthands).
    - Mutation checks (23), each failing tests in the end. Survivors at first, each resolved: a
      spread guard that repeated the key reader (a spread never reads as a key): removed. Six
      were untested (a line break in a quoted string, an escape past U+10FFFF, a template as a
      key, numeric keys as JavaScript names them, an object ending after a comma, a name without
      a colon) and Starlight choosing the first `locales` *object*: each got a test.
- **V2, the plugin:** `format-vitepress` (detection, layout, links) with fixtures and the
  contract kit. Registered in `app/plugins.ts`, and opened in the UI harness.
  - *Done-notes:* `src/plugins/format-vitepress/`, described in its
    [README](../../src/plugins/format-vitepress/README.md), registered in `app/plugins.ts`.
    - **Finding the site (V5), refined:** "one level down" became a list of usual folder names
      (the project itself, `docs/`, `doc/`, `website/`, `site/`, `documentation/`) with
      `.vitepress/config.*` or `.vitepress/config/index.*`. `ProjectFiles` can only list a folder
      recursively, so searching every top-level folder would read the whole project on each
      detection. A site elsewhere sets `siteDir` (and pins the format).
    - **Locales from the config:** the shallowest `locales` (the search options have their own,
      deeper in). Every key names a folder, even when its entry is built with a spread, as
      VitePress's own docs do; its locale is a plain-string `lang`, else the key. A spread among
      the keys, or `locales` built in code, falls back to Starlight's conventions.
    - **`srcDir`** from the option, else the config's when it's a plain string, else the site's
      folder. Pages are `.md` files outside dot-folders and outside `public/` at the source root.
    - **Links (V4)** as Starlight's, with `.md` and `.html` suffixes kept as written (dropping
      the locale's segment is enough for both).
    - **VitePress's Markdown (V3):** the `root-locale` fixture's guide has every row of the
      table, and its home page is all frontmatter. A new integration test
      (`tests/integration/fixture-pages.test.ts`) parses every Markdown page in every plugin's
      fixtures with the real parser: each is kept exactly and satisfies every invariant (49
      pages). No dialect change was needed.
    - **The UI harness** now bundles `.vitepress/` folders from fixtures (Vite's glob skips
      dot-folders unless they're named; only this one is, so fixtures' `.paperl10n/` status
      files stay out as before), and opens `format-vitepress/root-locale`.
    - The root README says Paper Lion works with VitePress, and links the plugin.
    - Tests: the contract kit on six fixtures (root locale, a site in `docs/` with `srcDir` and
      spreads, a folder per locale, locales built in code with cased folders, a config that
      never names VitePress, no config with `siteDir`), detection (each config name and folder,
      the root first, nothing deeper), listing, locales, target paths, links, options and each
      error, and `srcDir` forms; the harness opening the site; and the fixture pages.
    - Mutation checks (19), each failing tests in the end. Survivors at first, each resolved:
      three were redundant and removed (`projectPath` already reads `./src`, `src/`, and `.`;
      `root` isn't a locale id, so a separate check for it repeated `localeId`; swapping the
      source's own folder for itself changed nothing). Two were untested (a spread among the
      locale keys, and `siteDir` still reading the config): each got a test.
- **G1, the contract:** API v4 (`Message` fields, `parse` role, `scan` context, plural forms),
  the kit's new checks, and `catalog-banana` moved over.
  - *Done-notes:* plugin API version 4 (`SUPPORTED_API_VERSIONS` is `[4]`; every built-in plugin
    moved), described in [the formats doc](../domains/formats.md#catalogformat).
    - **The contract:** `parse(text, role)` (`'source' | 'target' | 'documentation'`),
      `scan(text, message?)`, optional `pluralForms(locale, target)` giving each form's sample
      numbers (`PluralForm`), `CatalogEdit.locale`, and `forms` on a `set` change. `Message`
      gains optional `forms`, `documentation`, `needsReview`, `previousSource`, and `flags`.
      Setting a message always clears its review mark, even to the same text.
    - **Two refinements to the plan:** plural forms are on the format, not the layout (they need
      a locale and maybe its file, not the project). And `CatalogEdit` carries the target's
      locale, which the plan missed: a new `.po` file's header needs `Language` and
      `Plural-Forms`.
    - **The registry's guarded view** always has `pluralForms` (none without the plugin's) and
      passes the role and the message through.
    - **The workspace** reads each file as its role (`readParsedCatalog` and `readCatalogFile`
      take it) and scans each text as a text of its source message (a message the source doesn't
      have, by itself). `saveCatalog` passes the locale. Nothing uses the new `Message` fields
      yet: that's G3.
    - **`catalog-banana`** needed no code change (its `parse` and `scan` ignore the new
      arguments, and its messages have none of the new fields), only its manifest.
    - **The kit:** two new checks (each message's shape, with one form per plural form of its
      locale; plural forms by whole numbers, none in two forms, stable). The edit checks now
      cover forms and review marks, compare translated messages only (gettext keeps emptied
      entries), write only into target files, and write a new file for the fixture's first
      target locale. Scanning passes each message, and every role is tried with malformed text.
    - **The fake catalog plugin** has plural forms (`key[]=one|other`), review marks
      (`?(old)key=…`), two plural forms for every locale, and files that can say their role
      (`# role: source`) and read as malformed in another. The workspace tests and the kit's
      tree carry role lines, so a file read in the wrong role fails a test.
    - Tests: 14 new broken plugins (shapes, plural forms, review marks kept, other forms dropped,
      plural forms flattened in a new file, a scanner that crashes given a message, a target
      that fails to parse, documentation that throws), four well-behaved variants that must pass
      (`needsReview: false`, a template with more forms, an emptied entry kept, a plugin that
      refuses to write a source), `messageProblems` and `pluralFormProblems` table-driven, the
      registry passing the role, message, and plural forms through (and guarding
      `pluralForms`), and the roles, messages, and locale in `readCatalog`, `checkMessage`, and
      `saveCatalog`.
    - Mutation checks: 24 on the kit, 14 on the workspace's wiring (each role, the locale, the
      scanned message), and 3 on the kit's own reading roles; each fails tests in the end.
      Survivors at first, each resolved: four kit lines were redundant and removed (a filter for
      `undefined` fields, which the strict optional types rule out; a plural fallback that can't
      apply; a forms branch of `isTranslated`; an "others untouched" assertion that "set back"
      already makes); four kit choices that could be too strict got well-behaved variants; three
      got broken plugins or direct tests; and six role swaps in `keepMessagesUpToDate`,
      `listCatalogs`, and `markExistingUpToDate` went unnoticed until the fake learned to read
      its role.
- **G2, the plugin:** `catalog-gettext` (detection, layouts, locale names, the `.po` reader and
  patcher, flags-aware scanning, the plural formula evaluator) with fixtures.
  - *Done-notes:* `src/plugins/catalog-gettext/`, described in its
    [README](../../src/plugins/catalog-gettext/README.md), registered in `app/plugins.ts`.
    - **The plural table (G2's open question):** gettext formulas generated from Unicode CLDR
      48.1 by [php-gettext/Languages](https://php-gettext.github.io/Languages/) (MIT; the CLDR
      data Unicode-3.0, both compatible with GPL-3.0), 220 languages, committed as the plugin's
      `plural-forms.json` by `pnpm update:gettext-plurals` (`scripts/gettext-plurals.ts`), as
      the language data is: no dependency. A test keeps the file exactly what the generator
      writes, and every formula in it parses with each form reachable.
    - **Writing as msgmerge does:** checked against gettext's own `write-po.c` and libunistring's
      line breaker (not a run of `msgmerge`, which isn't installed here): the 79 columns are the
      whole line, quotes and keyword included; a trailing space counts; a line breaks before the
      word that would pass it; a word too long stays whole; only `\a \b \f \n \r \t \v \\ \"`
      are escaped. One difference, documented: gettext breaks by Unicode's rules and display
      width, this after spaces and by character.
    - **A refinement to the plan:** a domain with no template and no source-locale file isn't
      listed (G1's third source, "the target's own `msgid`s"). The contract lists a catalog by
      its source file, and the kit checks that it exists and is never a target; a catalog
      without one needs a contract change. Left for after M5, in the README's "Not yet".
    - **Safe before G4:** the editor sends only a message's first form until G4, so a change
      with fewer forms than a plural entry has keeps the rest, and a new plural entry is padded
      with empty forms.
    - `tsconfig.core.json` includes a plugin's JSON files (not only its manifest), and the
      generated table is in `.prettierignore`, as the language data is.
    - Tests: the contract kit on five fixtures (side by side, Django, Sphinx, a template alone,
      no PO files); the PO reader (strings, every part of an entry, entries without blank lines,
      obsolete entries, CRLF, the header, 14 kinds of malformed text); the writer (wrapping at
      the exact boundary, runs of spaces, escapes, each kind of patch on the Hebrew fixture, CRLF
      and a missing final break, new files and headers); the formula evaluator (precedence,
      division by zero, refusals, samples, every formula in the table); locale names both ways;
      scanning by flags; and the plugin's layouts, options, reading, plural forms, and the UI
      harness opening the side-by-side project.
    - Mutation checks (40), each failing tests in the end. Survivors at first, each resolved: a
      locale-name check on side-by-side files repeated what every reader of those names does
      (removed); and eight untested (an obsolete empty msgid before the header, a line of exactly
      79 columns, a run of spaces at a break, `#|` lines in a source entry, a fuzzy entry without
      `#|` set to its own text, a lowercase header field, two templates of one domain, a
      directive two flags both mark): each got a test.
- **G3, the domain and main:** documentation per message, forms in pairing, checks and saving,
  needing review as outdated, and the DTOs.
- **G4, the UI:** forms in the editor, "Needs review" with the old source, and context.
- **G5, docs and the PRD:** the decisions into the PRD (its own PR, for approval).

## Open questions for the maintainer

- Real projects to check against. Which VitePress site, and which gettext project? Otherwise,
  fixtures shaped like VitePress's own docs and like a Django app and a GNOME app.
- The CLDR-to-gettext plural formula table (G2): where its data comes from, and whether it's
  a generated file (like `language-data.json`) or a dependency.
- Should a later step run `msgmerge`-like updates (bring a `.po` up to date with a changed
  template)? Recommended: not in M5. Paper Lion adds missing entries as they're translated, and
  `msgmerge` stays the project's tool.
