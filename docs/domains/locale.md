# Domain: `locale`

Languages, text direction, and locale metadata. Code: `src/domains/locale/`, public API
`#domains/locale`.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Locale id | A well-formed BCP 47 tag in canonical case (`he`, `pt-BR`, `zh-Hans`, `be-tarask`). A kernel primitive: `LocaleId` in `#kernel/locale-id`. |
| Locale | A locale id plus the facts the app relies on. In M0 that's only its text direction. |
| Text direction | `ltr` or `rtl`: the base direction for text in that locale. Each editor pane sets `dir` from it. |
| UI locale | The language of Paper Lion's own interface. Separate from a project's source and target locales. |

## Public API (M0)

```ts
type TextDirection = 'ltr' | 'rtl';
interface Locale { readonly id: LocaleId; readonly direction: TextDirection }

localeFrom(id: LocaleId): Locale                               // can't fail: the id is already valid
parseLocale(input: string): Result<Locale, InvalidLocaleId>    // for raw input (config files)
```

## Invariants

- A `Locale` is only created by `localeFrom`, so its direction always matches the rules below.
- **Direction is decided in the main process and sent to the UI.** The UI never computes a
  direction itself.
- **What a locale id accepts:** the syntax rules are in `#kernel/locale-id`. It doesn't map
  deprecated codes (`iw` stays `iw`) or a system's own codes (`pt_BR`, VitePress's `root`):
  translating those is the format plugin's job.

## Direction rules

`localeFrom(id, catalog)` decides a locale's direction:

1. A language the **catalog** knows, or the project's config defines or adjusts, has its own
   direction (`he`, `ar`, `ydd` → `rtl`).
2. Otherwise an explicit **script subtag** decides (`az-Arab-IR` → `rtl`, `ku-Latn-TR` → `ltr`).
   Scripts written right to left: Adlam, Arabic, Arabic Nastaliq, Hebrew, Mandaic, Mende Kikakui,
   N'Ko, Hanifi Rohingya, Samaritan, Syriac, Thaana, Yezidi.
3. Otherwise the **base language** does (`ar-EG` → `ar`), including two deprecated codes still
   found in the wild (`iw` → `he`, `ji` → `yi`). Unknown languages are `ltr`. Private-use subtags
   (`-x-…`) never carry a script.

## The language catalog (M1, steps L1–L2)

`domain/language-data.json` is the catalog of languages Paper Lion knows: 1,471 languages, each
with its BCP 47 tag (what Paper Lion saves), MediaWiki code, direction, autonym (when known),
English name, script, regions, and fallbacks; plus aliases (old and MediaWiki codes → tags) and,
for 254 regions, their languages by number of speakers.

In code (`#domains/locale`):

- `bundledLanguageCatalog()` loads the shipped files once, checking their shape. A test checks
  every names file is bundled.
- `catalog.find(code)` by tag or alias, ignoring case (`pt-br`, `sr-el`); `languagesOfRegion`;
  `nameIn(language, uiLanguage)`, falling back to English.
- `catalog.withCustom(languages)` adds a project's own languages or adjusts known ones (from the
  config's `languages`, `docs/domains/workspace.md`): how a project fixes a direction (`rhg`) or
  uses a code the catalog doesn't know.
- `searchLanguages(catalog, query, { uiLanguage })`: an exact code first, then an exact name, a
  name that starts with the query, a word that starts with it, then a name that contains it, over
  the autonym, the English name, and the interface-language name, ignoring case and accents.
- `suggestLanguages(catalog, …)`: the picker's sections before typing: the project's languages,
  the user's last six picks, and suggestions (English, the OS languages, exact then base, then the
  OS region's five most spoken), each language once.

**Names in other interface languages live in their own files**, one per interface language the
app ships: `domain/language-names/he.json` (tag → name, only where it differs from English, one
per line). Each interface language adds about 35 KB; keeping them apart keeps the catalog's diffs
readable and loads only the names the current interface needs. The generator reads the interface
languages from the UI's message files, so a new UI language gets its names file on the next
update, and a test fails until it does.

- **Generated, never hand-edited:** `pnpm update:language-data` (needs the network; run by hand
  and review the diff). A test fails if the file differs from what the generator writes.
- **Sources** (recorded in the file): MediaWiki's `languageinfo` API (GPL-2.0-or-later; its
  names include Unicode CLDR data, Unicode-3.0) and `@wikimedia/language-data`, the data behind
  Wikipedia's language selector (GPL-2.0-or-later). Both are compatible with GPL-3.0-or-later.
- **Rules the generator follows:**
  - Tags are MediaWiki's, **checked but never canonicalized**: CLDR's aliases would merge
    languages localization keeps apart (Tagalog/Filipino, Serbo-Croatian and Montenegrin into
    Serbian, Dari into Persian, Western Punjabi into Lahnda).
  - **Right to left if either source says so:** MediaWiki only knows the direction of languages it
    has interface messages for, and says "ltr" for the rest; a right-to-left script settles it
    (17 languages, such as `ar-001`, `ars`, `ydd`, `syc`).
  - Special codes (`qqq`, `qqx`, `mis`, `mul`, `und`, `zxx`) are left out; codes that share a tag
    (`be-x-old`, `sr-el`) become aliases. Lookups ignore case, so `pt-br` finds `pt-BR`.
  - The autonym comes from MediaWiki, then from ULS; 645 languages have only an English name.

## Not here (yet)

- The picker (L5), fallback chains in use (`pt-BR` → `pt`, catalogs, M4), plural rules.
- Mapping system-specific codes to locale ids: done by format plugins.
