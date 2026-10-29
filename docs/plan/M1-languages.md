# M1 discussion: the language picker and language data

Status: **decided (2026-10-28), ready to build.** See [Decided](#decided-round-1),
[Round 2](#decided-round-2), and the [steps](#steps). The original seed follows, for context.

## Decided (round 1)

### What the Wikimedia data gives us (checked 2026-10-28)

- **MediaWiki `languageinfo`** (`action=query&meta=languageinfo` on meta.wikimedia.org): **1,489
  languages** in one call, each with its MediaWiki code, a BCP 47 tag, direction, autonym,
  English name (or the name in any language, with `uselang`), fallbacks, and variants. 53 are RTL.
  30 MediaWiki codes differ from BCP 47 (`zh-min-nan` → `nan`, `simple` → `en-simple`,
  `sr-el` → `sr-Latn`, `be-x-old` → `be-tarask`). The site matrix (374 Wikipedia languages) is a
  subset of it.
- **ULS language-data** (`@wikimedia/language-data`, GPL-2.0-or-later, the data behind
  Wikipedia's language selector): 876 languages with their script and regions, the RTL scripts,
  and **254 territories**, each with its languages by number of speakers
  (`IL → he, en, ar, apc, ru, …`).

### Decisions

| Topic | Decision |
|---|---|
| Data | **Both sources**, fetched by a maintenance script (`scripts/update-language-data.ts`, run by hand, never in CI) into one sorted, committed JSON file in the `locale` domain, with the sources and the date. `languageinfo` is the catalog and the authority for codes and direction; ULS adds scripts, regions, and per-country languages. Tests validate the file, including that RTL languages agree with ULS's RTL scripts. It replaces M0's hard-coded RTL table. |
| Codes | **BCP 47** (`pt-BR`, `sr-Latn`) in `paperl10n.config.json` and in Paper Lion's own state. MediaWiki codes (`pt-br`, `sr-el`) are accepted as aliases when reading and searching. Plugins map to their own names (as `format-starlight` maps `pt-BR` → `pt-br/`). |
| Where a choice lives | **The config holds the project's languages** (shared through git); choosing a new target offers to add it there. **The app remembers, per user,** recently used languages and the last choice per project. |
| Scope | **All real languages** from `languageinfo`, minus internal and test codes (`qqq`, `qqx`, `en-x-piglatin`). Deprecated codes (`be-x-old`, `mo`) become search aliases of their replacements. Formal and informal variants (`de-formal`) stay: they matter for localization. |
| Suggestions | **From the OS, never from an IP lookup** (that would be a network call to a third party; the PRD is local-first with no telemetry). The OS locale's region (`he-IL` → `IL`) plus ULS's territories give the region's languages. |

### The picker (proposal, from the brainstorm)

No list of 1,489. Sections, top to bottom:

1. **In this project:** languages the project already has (Starlight's locale folders, existing
   translations). Usually the most relevant.
2. **Recently used:** your last 4–6 picks.
3. **Suggested:** English, your OS languages, then your region's most-spoken languages.
4. **Search everything:** by autonym, English name, name in the interface language, or code
   (`pt-br`, `pt-BR`, "Portuguese", "português" all find it).

Each row: the autonym in its own `lang`/`dir`, the name in the interface language, the code in
`<bdi>`, and an RTL marker. Names in the interface languages the app ships (now `en`, `he`) come
from `languageinfo` with `uselang`, so minority languages are named too (`Intl.DisplayNames`
doesn't know many of them).

## Decided (round 2)

| Topic | Decision |
|---|---|
| Placement | The header's language pair becomes a button: each side opens the picker (the target most often). The picker also opens by itself when a project's config has no target language, instead of today's error. |
| Unknown codes | Allowed. Shown with the code and an "unknown language" note; the user can give it a name and direction, saved in `paperl10n.config.json` (shared with the team), so nothing is guessed silently. |
| Browse by region | Not now: sections + search. The ULS region data will already be in the file for later. |
| Creating things | Choosing a language writes only the config in M1, atomically (Paper Lion's first small write). Folders and files appear when you start translating a page (M2, "seed from source"). |
| Plugin code mapping | **Revised with the maintainer:** after checking Starlight, Astro, VitePress, Nuxt, Docusaurus, and Hugo (folder names are the site author's choice; the language tag is a separate BCP 47 field), plugins now report the project's locales as `ProjectLocale`s (locale id + folder) in the contract (plugin API v2), and `format-starlight` reads the Astro config statically and matches existing folders ignoring case. See `docs/domains/formats.md`, "Locale codes and folders". A fuller hook for systems that name *files* by code (banana-i18n's `pt-br.json`) waits for M4. Fallback chains (`pt-BR` → `pt`) also wait for catalogs. |

## Steps

Each is its own branch and PR, as in M0.

- **L1, the data:** `scripts/update-language-data.ts` (both sources, names in each interface
  language via `uselang`), the committed JSON in `src/domains/locale/data/`, and tests that
  validate it (unique BCP 47 tags, a direction and an autonym for each, RTL agreeing with ULS's
  RTL scripts, aliases pointing at real entries). Attribution for both sources.
  - *Done-notes:* `scripts/language-data.ts` (pure builder, under the coverage floor),
    `scripts/update-language-data.ts` (`pnpm update:language-data`), and
    `src/domains/locale/domain/language-data.json`: 1,471 languages, 49 aliases, 254 regions,
    218 KB, one entry per line for clean diffs. Tests check the builder on small inputs and the
    committed file (no hand edits, unique tags, references resolve, RTL agrees with scripts).
  - **Found while building it:**
    - `Intl.getCanonicalLocales` merges languages through CLDR aliases (`tl` → `fil`,
      `sh`/`cnr` → Serbian, `prs` → `fa-AF`, `pnb` → `lah`; 42 tags changed). Tags are now
      checked, never canonicalized.
    - `languageinfo` says "ltr" for 17 languages written in right-to-left scripts (it only knows
      the direction of languages with MediaWiki interface messages), so a right-to-left script
      makes a language RTL too. **To review:** `rhg` (Rohingya) becomes RTL from ULS's Hanifi
      script, though the Rohingya Wikipedia uses Latin; a project can override a direction in its
      config (round 2).
    - 910 of 1,489 entries have no autonym in `languageinfo`; ULS fills 265, so 645 languages show
      their English name only. The planned "an autonym for each" check became "an English name for
      each, an autonym when known".
  - Mutation checks: ignoring the script's direction, canonicalizing tags, and a hand edit to the
    file (Hebrew as "ltr") each fail tests.
  - **Follow-up (decided with the maintainer):** names in interface languages other than English
    moved to one file each (`language-names/he.json`), instead of a field per language on every
    line. Measured: each interface language added ~32 KB and ~110 bytes per line (15 languages
    would mean ~630 KB and ~440-byte lines, with every line changing whenever one is added). The
    generator derives the interface languages from the UI's message files; a test checks there's
    exactly one names file per non-English UI language.
- **L2, the `locale` domain:** a `LanguageCatalog` (lookup by BCP 47 tag or alias, direction,
  names); `localeFrom` uses it instead of M0's RTL table; custom languages from the config
  (`languages: { "<code>": { "name", "dir" } }`); pure search ranking and suggestion rules
  (project languages, recents, OS languages, region), with table tests.
  - *Done-notes:* `language-data-file.ts` (the file types, now the single source for the
    generator too, and a shape check for the bundled JSON), `language-catalog.ts`,
    `bundled-catalog.ts`, `language-search.ts`, `language-suggestions.ts`. `localeFrom` takes its
    direction from the catalog; M0's RTL language table is gone (the script list stays for unknown
    tags). The config's `languages` (workspace) feeds `catalog.withCustom`, so a project can fix
    `rhg` or add its own code; `openProject` uses it for both sides.
  - The generator now also applies Paper Lion's own locale-id rules: `nl-u-SD-bebru` (Brussels
    Dutch, a `-u-` extension) is left out; 1,470 languages.
  - Found while testing suggestions: the catalog has regional variants as languages in their own
    right (`en-US`, `pt-PT`). Suggestions offer the exact OS language when it exists, then its base
    language.
  - Mutation checks: ignoring the catalog's direction, custom languages without their direction,
    search without the exact-code rank, suggestions without de-duplication: each fails tests.
- **L3, the use cases and IPC:** list the project's languages (from the plugin: declared locales
  and existing locale folders), search and suggestions, and choosing a target. Opening a project
  without a target language returns a "needs a target" state instead of an error.
  - *Done-notes:* `targetLocale` is optional in the config; without it, `openProject` returns
    `targetLocale: null`, and listing or reading pages returns `workspace.no-target-locale`. New
    use cases in `workspace`: `suggestTargetLanguages`, `searchTargetLanguages`,
    `chooseTargetLocale` (session only until L4), with IPC methods of the same names (contract,
    preload, main's validators, `guardApi`, the harness transport, and end-to-end cases).
    `ProjectSessions` gained `update`, with contract tests. Until L5, the UI showed a notice
    for a project without a target.
  - Each open project keeps its own catalog: the bundled one plus the config's `languages` and
    any locale folder whose code the catalog doesn't know, so a Starlight folder like
    `qaa-x-folder/` can be shown and chosen without a config entry. The suggestions' "in this
    project" section includes the config's languages and the current target, even before
    their folders exist.
  - The UI sends the interface language with each request, so names come back in it.
  - Mutation checks: search or suggestions offering the source, choosing the source, choosing
    without storing it, the catalog without unknown folders, main ignoring a malformed recent
    list, and listing pages without a target: each fails tests.
- **L4, writing the config:** an atomic `ProjectWriter` port (temp file + rename) with its
  contract suite, and a config update that changes only the language fields, keeping the rest
  of the file byte for byte. Per-user recents live in the renderer's preferences (ADR 0016).
  - *Done-notes:* `ProjectWriter` (workspace port): `nodeProjectWriter` writes a temporary
    file next to the target, flushes it, and renames it over the target. It keeps permissions,
    writes through symlinks only inside the project, and leaves nothing behind on failure.
    `InMemoryProjectFiles` gained `writeText`, so it stands in for the writer in tests and the UI
    harness (where writes last until reload). Both pass `describeProjectWriterContract`. The
    opener now returns a writer with the files.
  - `setConfigString` (pure) sets one top-level value byte-preservingly, with a parse-back safety
    net. `chooseTargetLocale` now saves the choice: it re-reads the config from disk (keeping a
    teammate's edits since opening), edits only `targetLocale`, writes it, then updates the
    session. Already set: no write. New error `workspace.config-unwritable`.
  - Found while testing: the IPC end-to-end test chose a target on the `format-stub` fixture on
    disk and rewrote the committed fixture's config (only `"he"` → `"ar"`, nothing else). Tests
    that write now use temporary copies, and CI fails if tests or the build change the checkout.
  - Recents (per-user, in the renderer's preferences) move to L5, where the picker records them.
  - Mutation checks, each of which fails tests: the scanner ignoring escapes, editing the first of
    repeated keys, the writer following links outside the project, dropping permissions, or never
    renaming into place, choosing without saving, and writing when nothing changed. The CI
    clean-checkout step fails with a modified fixture and passes on a clean tree.
- **L5, the picker:** the header button, the dialog (sections, search, keyboard and screen
  reader support, each name with its own `lang`/`dir`), and the opened-without-target flow.
  - *Done-notes:* `LanguagePicker.vue`, a native modal `<dialog>` with the ARIA combobox pattern:
    a search box (`role="combobox"`, `aria-activedescendant`) over a `listbox` of `group`s
    (In this project, Recently used, Suggested; results while typing). Arrow keys move and wrap,
    Enter chooses, Escape and Cancel close, and a status line announces the count or "no match".
    Each row shows the autonym with its own `lang`/`dir`, then the name in the interface language
    and the code (LTR, but placed by the row's direction), and a check on the current target.
    A name in the interface language (no autonym known) isn't marked as the language's own.
  - The header's target becomes a button ("Translation language: עברית. Change it"). A project
    without a target opens the picker by itself, and the page offers "Choose the translation
    language" if it's dismissed. Choosing saves to the config (L4), lists the pages again, and
    records the pick among the per-user recents (renderer preferences, at most six).
    `useLanguagePicker` keeps only the newest answer, as `useProject` does.
  - Checked in the browser harness (light, dark, Hebrew) and in Electron: a new e2e test opens a
    copy of a project without a target, finds Arabic by typing, chooses it with Enter, and checks
    the panes (`ar`/`rtl`) and the saved config.
  - **Not done, still open (decided in round 2; tracked in [follow-ups](follow-ups.md)):** the *source* side of the header isn't a button
    yet (changing the source changes which files are sources); unknown codes can't be named and
    given a direction from the picker yet (the no-match message says how to add them to the
    config); rows have no separate RTL marker (the autonym shows its own direction).
  - Mutation checks: no auto-open without a target, a pick not remembered, an autonym without its
    `lang`, arrow keys that don't wrap, and an older suggestions answer winning: each fails tests.

## Why it matters

Locales touch everything in Paper Lion: which files are paired, each pane's `lang`/`dir`, how
catalogs are named, and what the user sees in the picker. Getting the model and the data source
right early is cheap. Changing them after plugins and saved state depend on them is not.

## What M0 already fixed (and left open)

- `LocaleId` is a kernel primitive (a validated string). `Locale` (with its direction) lives in the
  `locale` domain.
- M0's `localeFrom(id)` uses a small hard-coded RTL table. It's a placeholder. Callers only see
  `localeFrom(id) → Result<Locale, …>`, so a real data source can replace the table later.
- Direction is always computed in main and sent to the UI. The UI never guesses.
- Source and target locales come from `paperl10n.config.json` in M0. There's no picker.

## Questions to discuss

### 1. Where does language data come from?

| Source | Gives us | Concerns |
|---|---|---|
| **The project itself** (via plugins): VitePress `locales`, existing `i18n/*.json` file names, locale folders | What this project actually has or declares. Probably the first thing a picker should show. | Each system uses its own codes (see 3). |
| **`Intl` built-ins** in Electron (Chromium has full ICU): `Intl.DisplayNames`, `Intl.Locale` (text direction info), `Intl.getCanonicalLocales` | Language names in any UI language, autonyms (a language's name in itself), canonicalization. No dependency. | No scripts-per-language or region grouping. Data changes with the Electron version. |
| **`@wikimedia/language-data`** (the data behind the Universal Language Selector) | Autonyms, scripts, regions, direction, redirects for deprecated codes. Proven for picker UX at Wikimedia scale. | A dependency; MediaWiki code conventions. |
| **CLDR JSON** | The authoritative source for names, scripts, plural rules. | Large; more than a picker needs. |
| **IANA language subtag registry** | Validation of BCP 47 subtags. | Validation only. |

Which combination? For example: the project's locales first, `Intl` for names, and one dataset for
direction and scripts.

### 2. What is a "locale" in our model?

- Just a BCP 47 tag, or a richer record (tag, autonym, English name, direction, script, plural
  rules, fallback chain)?
- Can the user define a **custom locale** or override a direction (a constructed language, or a code
  the data doesn't know)? Where is that stored: the project config or app settings?
- Fallback chains (`pt-BR` → `pt`): do we need them in M1, or only for the catalog status later?

### 3. Codes differ by system

VitePress uses `root` for the default locale and arbitrary folder names. gettext uses `pt_BR`.
MediaWiki/banana uses codes like `be-tarask`, `zh-hans`, and `sr-ec`. Some sites use lowercase
`pt-br`.
- Should each plugin translate between its codes and BCP 47 (`toLocaleId`/`fromLocaleId` in the
  plugin contract)? That would be a contract change to settle before more plugins exist.
- How do we show a code the user's system uses but our data doesn't recognize?

### 4. Picker UX

- Search by English name, autonym, *or* code, in any script (a Hebrew speaker types "עברית").
- What's shown first: the project's declared locales, recently used, or all?
- Grouping by region (as ULS does), or a flat list with search?
- Each name in the list needs its own `lang`/`dir` (autonyms in Arabic script are RTL even in an LTR
  list), and codes inside `<bdi>`.
- Keyboard and screen reader behavior.
- One picker for source and target, or different defaults for each?

### 5. UI locale vs. content locales

The app's own interface language (the chrome) and the project's source and target locales are
separate settings. Should the picker component serve both? And where is the UI language stored?

### 6. Architecture placement (proposal to react to)

- The `locale` domain owns the model and its rules.
- A `LanguageData` port in `locale/application`, with an adapter for whichever data source we choose.
- Project-declared locales come in through the format plugins.
- A use case like `listLocaleChoices(projectId)` merges them and returns DTOs.
- The picker is a `ui/` component fed by that use case.

## Inputs to bring to the discussion

- Real examples from your projects: which locales, which codes, any odd cases.
- How much of ULS's behavior you want: you know it well, so it's a natural reference point.
- Whether the picker should ever *create* a locale in the project (add a folder, add `he.json`), or
  only choose among existing and known ones.
