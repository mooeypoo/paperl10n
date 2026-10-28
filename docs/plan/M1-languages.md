# M1 discussion: the language picker and language data

Status: **discussion seed, not a plan.** Bring this up for a brainstorm before M1's locale picker is
implemented. Nothing here is decided. The goal is to arrive at that discussion with the questions
already laid out.

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
