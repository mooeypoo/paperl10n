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

## Direction rules (M0)

1. An explicit **script subtag decides**: `az-Arab`, `pa-Arab` → `rtl`; `az-Latn`, `ku-Latn`,
   `ur-Latn` → `ltr`. Scripts written right to left: Adlam, Arabic, Arabic Nastaliq, Hebrew,
   Mandaic, Mende Kikakui, N'Ko, Hanifi Rohingya, Samaritan, Syriac, Thaana, Yezidi.
2. Otherwise the **language's usual script** decides: `he`, `ar`, `fa`, `ur`, `yi`, `ckb`, `ps`,
   `dv`, `ug`, `sd`, … → `rtl` (the full list is in `domain/locale.ts`).
3. Regions don't matter (`en-IL` is `ltr`, `ar-EG` is `rtl`). Private-use subtags (`-x-…`) are
   ignored. Unknown languages are `ltr`.

**These tables are a placeholder.** M1 picks a real language-data source (names, autonyms,
scripts) during the locale-picker design discussion: see
[`docs/plan/M1-languages.md`](../plan/M1-languages.md). Callers only use `localeFrom` and
`parseLocale`, so replacing the data doesn't change them.

## The language catalog (M1, step L1)

`domain/language-data.json` is the catalog of languages Paper Lion knows: 1,471 languages, each
with its BCP 47 tag (what Paper Lion saves), MediaWiki code, direction, autonym (when known),
English name, script, regions, and fallbacks; plus aliases (old and MediaWiki codes → tags) and,
for 254 regions, their languages by number of speakers. L2 wires it in; until then the M0 tables
above still decide direction.

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

- Language names and autonyms, the picker, fallback chains (`pt-BR` → `pt`), custom locales,
  plural rules: all in M1 or later.
- Mapping system-specific codes to locale ids: done by format plugins.
