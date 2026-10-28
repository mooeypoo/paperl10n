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
| Plugin code mapping | **Deferred to M4** (decided by the agent, to revisit): `format-starlight` maps codes internally, and the first plugin that needs a contract hook is banana-i18n. Fallback chains (`pt-BR` → `pt`) also wait for catalogs. |

## Steps

Each is its own branch and PR, as in M0.

- **L1, the data:** `scripts/update-language-data.ts` (both sources, names in each interface
  language via `uselang`), the committed JSON in `src/domains/locale/data/`, and tests that
  validate it (unique BCP 47 tags, a direction and an autonym for each, RTL agreeing with ULS's
  RTL scripts, aliases pointing at real entries). Attribution for both sources.
- **L2, the `locale` domain:** a `LanguageCatalog` (lookup by BCP 47 tag or alias, direction,
  names); `localeFrom` uses it instead of M0's RTL table; custom languages from the config
  (`languages: { "<code>": { "name", "dir" } }`); pure search ranking and suggestion rules
  (project languages, recents, OS languages, region), with table tests.
- **L3, the use cases and IPC:** list the project's languages (from the plugin: declared locales
  and existing locale folders), search and suggestions, and choosing a target. Opening a project
  without a target language returns a "needs a target" state instead of an error.
- **L4, writing the config:** an atomic `ProjectWriter` port (temp file + rename) with its
  contract suite, and a config update that changes only the language fields, keeping the rest
  of the file byte for byte. Per-user recents live in the renderer's preferences (ADR 0016).
- **L5, the picker:** the header button, the dialog (sections, search, keyboard and screen
  reader support, each name with its own `lang`/`dir`), and the opened-without-target flow.

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
