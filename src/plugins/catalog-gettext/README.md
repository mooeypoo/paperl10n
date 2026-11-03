# `@paperl10n/catalog-gettext`

Paper Lion's catalog plugin for [GNU gettext](https://www.gnu.org/software/gettext/): PO files,
one per locale, made from a template (POT).

## Layouts

A catalog is a **domain** (a file's base name: `lantern`, `django`). Two layouts are found:

```
po/lantern.pot                         side by side (GNOME, meson, autotools)
po/he.po
po/pt_BR.po

myshop/locale/en/LC_MESSAGES/django.po a folder per locale (Django, Python, Sphinx)
myshop/locale/he/LC_MESSAGES/django.po
myshop/locale/he/LC_MESSAGES/djangojs.po
```

- **The source** is the domain's template: the one next to the locale folders (or in a
  side-by-side folder), else the only template with that name anywhere in the project (Sphinx
  keeps its templates in `_build/gettext/`). Without a template, it's the source locale's own
  file (`locale/en/LC_MESSAGES/django.po`). A domain with neither isn't listed yet (see "Not
  yet").
- **A side-by-side folder holds one domain:** its template's, or, without one, the folder's name.
- **A template alone in a `locale/` or `locales/` folder** starts a folder per locale; elsewhere,
  a side-by-side folder.
- **Two catalogs with one domain** (`app/po/app.pot` and `lib/po/app.pot`) are told apart by their
  source's folder: keys `app/po/app` and `lib/po/app`.

## Locale names

gettext names locales `ll_CC@modifier`; Paper Lion saves BCP 47:

| gettext | BCP 47 |
|---|---|
| `he` | `he` |
| `pt_BR` | `pt-BR` |
| `sr@latin`, `sr_RS@latin` | `sr-Latn`, `sr-Latn-RS` |
| `zh_Hans` | `zh-Hans` |
| `ca@valencia` | `ca-valencia` |
| `de_DE.UTF-8` | `de-DE` (the encoding is ignored) |

A language is a 2- or 3-letter code, so `LINGUAS.po` or `django.po` aren't locales. A new file is
named gettext's way (`pt_BR.po`), unless the catalog already has that locale under another
spelling (`pt-br.po`), which it keeps.

## Messages

- **The key is the `msgid`**, after its `msgctxt` and gettext's separator (`\u0004`) when there is
  one: in gettext, the source text is the key. A changed source string is a new message.
- **Read as the source**, a message's text is its `msgid` (a template's `msgstr` is empty), and a
  plural's forms are `msgid` and `msgid_plural`. **Read as a translation**, it's the `msgstr`, or
  each `msgstr[N]`.
- **Documentation** is the entry's `#.` comments. **Flags** are its `#,` flags, without `fuzzy`:
  `fuzzy` is `needsReview`, and its `#| msgid` is `previousSource`.
- The header (the empty `msgid`) and obsolete entries (`#~`) aren't messages.
- **Files are UTF-8.** A file whose header names another charset is refused
  (`formats.invalid-catalog`, naming it); a template's `charset=CHARSET` placeholder is fine.

## Plural forms

A translation's `Plural-Forms` header says how many forms a message has and which a count takes
(`nplurals=3; plural=(n == 1) ? 0 : ((n == 2) ? 1 : 2);`). The formula is parsed by a small
evaluator for gettext's C expressions (`plural-formula.ts`), never `eval`ed. Each form is labeled
by the first counts that take it (`1`; `2`; `0, 3, 4, 5`).

A **new file**, or one without a usable header, takes its language's rule from
[`plural-forms.json`](plural-forms.json): gettext formulas generated from Unicode CLDR 48.1 by
[php-gettext/Languages](https://php-gettext.github.io/Languages/) (MIT; the CLDR data under
Unicode-3.0), refreshed by `pnpm update:gettext-plurals`. A language it doesn't know gets
msginit's default, `nplurals=2; plural=n != 1;`.

## Placeholders

By the entry's flags (the source's): `c-format`, `objc-format`, and `php-format` mark printf
directives (`%s`, `%1$d`, `%.2f`); `python-format` marks `%(name)s` and `%s`;
`python-brace-format` marks `{name}` and `{0}`. `%%`, `{{`, and `}}` are escapes. Without a flag,
`%` and `{` are text ("100%"), and only HTML tags are marked.

## Writing

Edits patch the file as read, in the style GNU gettext's `msgmerge` writes (its `write-po.c`), so
the project's next `msgmerge` makes no diff:

- **A changed translation** rewrites only that entry's `msgstr`, C-escaped, on one line when the
  whole line fits in 79 columns and has no line break inside, else `msgstr ""` and its lines,
  split after each `\n` and before the word that would pass 79 columns. It drops the entry's
  `fuzzy` flag (keeping its other flags) and `#|` lines, even when the text stays the same.
- **A change with fewer forms than a plural entry has** keeps the rest.
- **A new message** goes after the nearest entry before it in the template that the file has (or
  after the header), with the template's comments and flags.
- **An emptied message** the template still has becomes `msgstr ""` (gettext's untranslated),
  and **a message the template dropped** is written obsolete (`#~`), its translator comments
  kept, as `msgmerge` does.
- **A new file** is the template with a header for the language (`Language`, `Plural-Forms`, and
  `charset=UTF-8` set; `PO-Revision-Date` and `Last-Translator` emptied where the template has
  them), and every entry, untranslated unless set.
- **An existing header** is left as it is: updating `PO-Revision-Date` and `Last-Translator` is
  an open question (PRD §11).
- Line breaks (LF or CRLF) and a missing final line break are kept.

## Options (`paperl10n.config.json`)

```json
{
  "catalogFormat": "catalog-gettext",
  "formatOptions": { "catalog-gettext": { "dirs": ["po"] } }
}
```

| Option | Default | Meaning |
|---|---|---|
| `dirs` | the whole project | The folders to look for PO and POT files in. |

Any other option is rejected with `formats.invalid-options`.

## Detection

`certain` with a template (`.pot`) or an `LC_MESSAGES` folder, `likely` with PO files alone.

## Fixtures

- `side-by-side`: GNOME-style `po/` with a template, Hebrew (a fuzzy entry with `#|`, a context
  missing, three plural forms, a wrapped translation, a message the template dropped, an obsolete
  entry), and Brazilian Portuguese with CRLF and no final line break.
- `django`: a folder per locale with no template, English's own file as the source, two domains
  (`django`, `djangojs`), Python flags, Arabic's six forms, and "100%" without a flag.
- `sphinx`: translations in `locales/`, the template in `_build/gettext/`.
- `template-only`: a template with no translations yet.
- `not-gettext`: no PO files.

## Not yet

- **A domain with no template and no source-locale file** (a Django project that only has its
  translations): every PO file carries the source text in its `msgid`s, but the contract lists a
  catalog by its source file, which here doesn't exist.
- **Line breaking:** gettext breaks lines by Unicode's rules and counts display width; this breaks
  after spaces and counts characters. Prose wraps the same; a hyphenated word or CJK text can
  wrap differently.
- `msgmerge`-like updates from a changed template (not in M5), and updating an existing header.
