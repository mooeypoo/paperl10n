# `@paperl10n/catalog-banana`

Paper Lion's catalog plugin for [banana-i18n](https://github.com/wikimedia/banana-i18n) message
files: MediaWiki extensions and skins, jQuery.i18n apps, and Paper Lion's own interface.

## Layout

A **catalog is a messages folder**, with one JSON file per locale and `qqq.json` documenting each
message:

```
i18n/en.json        the source locale's messages          catalog key: i18n
i18n/qqq.json       documentation (not a locale)
i18n/he.json        Hebrew
i18n/pt-br.json     Portuguese (Brazil): MediaWiki writes codes in lowercase
i18n/api/en.json    a second catalog                       catalog key: i18n/api
```

The catalog key is the folder's path (`.` for the project's root). Each file is one JSON object:
`@metadata` (kept exactly as written) and the messages, as strings.

## Which folders are catalogs

In this order:

1. **`dirs`** in the plugin's options, if set.
2. **`MessagesDirs`** in MediaWiki's `extension.json` or `skin.json` (each value a folder or a list
   of folders), in the manifest's order.
3. **A scan of the project:** each folder holding the source locale's file, where that file has
   `@metadata` or the folder has a `qqq.json`. `node_modules` and `.git` are skipped. The scan
   also finds sample catalogs (test fixtures, examples); pin `dirs` to leave them out.

A folder without the source locale's file is skipped (or, when pinned in `dirs`, reported).

## Which file is which locale

Paper Lion saves BCP 47 locale ids (`pt-BR`, `zh-Hans`); the files are named by code. A locale's
file is an existing file whose name matches it ignoring case (`pt-br.json`, `PT-BR.json`). A new
file is named in lowercase, as MediaWiki does (`zh-hans.json`), unless the folder's file names
keep case (`pt-BR.json`), in which case it's named as the locale is written.

MediaWiki-specific codes that aren't BCP 47 in meaning (`sr-ec`, `be-tarask`) map by their
spelling only: `sr-ec.json` is listed as `sr-EC`.

## Options (`paperl10n.config.json`)

```json
{ "formatOptions": { "catalog-banana": { "dirs": ["i18n", "i18n/api"] } } }
```

| Option | Default | Meaning |
|---|---|---|
| `dirs` | found as above | The messages folders, in order. Each must hold the source locale's file. |

Any other option is rejected with `formats.invalid-options`.

## Reading and writing

Reading is strict JSON (RFC 8259; a leading BOM is allowed). A file that isn't, has a duplicate
key, or has a message that isn't a string is `formats.invalid-catalog`.

Writing patches the file as read, so an untouched file is never rewritten and a change touches only
its own bytes:

- **A changed message** replaces only its value. Setting a message to the text it has changes
  nothing, even where the file writes it its own way (`\/`).
- **Escaping follows the file:** non-ASCII text is written as is (as MediaWiki does), unless the
  file writes it escaped (`א`) and has none written raw.
- **A new message** goes after the nearest message before it in the source that the file has
  (before the first message when none does), with the file's indentation, `": "`, and line endings.
- **A removed message** goes with its comma.
- **A new file** is written like the source: `@metadata` with an empty `authors` list, then the
  messages in source order, in the source's indentation, line endings, and final newline.

## Placeholders

`placeholders.scan` finds what a translation must keep, as typed tokens:

| Token | Kind | Compared by |
|---|---|---|
| `$1`, `$2`, … | `parameter` | its text |
| `{{PLURAL:$1\|…}}` (any case) | `plural` | its parameter (`$1`) |
| `{{GENDER:$1\|…}}`, `{{GENDER:\|…}}` | `gender` | its parameter (empty for the reader) |
| `[[Page\|text]]`, `[https://… text]`, `[//… text]` | `link` | its target |
| `<b>`, `</b>`, `<br/>` | `tag` | its name, lowercased |
| `{{SITENAME}}`, `{{int:…}}`, other templates | `other` | its text |

Templates and links are matched with their own closing brackets and scanned inside, so tokens nest
(`$1` inside a plural) and never partly overlap. Syntax that isn't closed gives no token.

## Files

| File | Purpose |
|---|---|
| `paperl10n-plugin.json` | the manifest |
| `index.ts` | exports `plugin` (manifest + factory) |
| `catalog-banana.ts` | detection and the layout |
| `banana-json.ts` | reading and patching the JSON files |
| `banana-syntax.ts` | the placeholder scanner |
| `*.test.ts` | the plugin contract kit, fixtures, and unit tests |
| `fixtures/` | `mediawiki-extension` (two message folders, `MessagesDirs`), `jquery-app` (no `qqq.json`; a CRLF, fully escaped file; a file without a final newline), `paperl10n-self` (a copy of Paper Lion's own messages, taken 2026-10-31), `pinned-dirs` (found only through `dirs`), `not-banana` |

## Detection

- `certain`: `extension.json` or `skin.json` lists `MessagesDirs`.
- `likely`: a folder has a `qqq.json`, or a locale-named JSON file with `@metadata`.
