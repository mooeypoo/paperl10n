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

## Not here (yet)

- Language names and autonyms, the picker, fallback chains (`pt-BR` → `pt`), custom locales,
  plural rules: all in M1 or later.
- Mapping system-specific codes to locale ids: done by format plugins.
