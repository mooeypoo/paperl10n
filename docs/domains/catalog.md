# Domain: `catalog`

Message catalogs: messages, their keys, their documentation, and checking a translation against
its source. Code: `src/domains/catalog/`. Other code imports `#domains/catalog`. Decisions:
[M4 plan](../plan/M4-catalogs.md). Where catalogs live and how their files read and write is each
format plugin's ([formats](formats.md#catalogformat)); message status is the `translation`
domain's.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Catalog | A set of messages with one file per locale, and maybe a documentation file. Identified by a catalog key. |
| Catalog key | A catalog's locale-independent identity, chosen by its plugin (banana-i18n: the messages folder; gettext: the domain). Any non-empty text. |
| Message | A key and its text, in one locale's file. |
| Message key | A message's identity in its catalog (`paperl10n-open-folder`). Any non-empty text, as written. |
| Documentation | What the catalog says about a message for translators (banana-i18n's `qqq.json`). Read-only in Paper Lion. |
| Catalog message | A source message with its documentation and its translation into the target language. |
| Not in source | A message the translation has and the source no longer does (PRD: "orphaned"). Listed apart, kept until the translator removes it. |
| Placeholder token | A piece of a message its translation must keep, found by the plugin's scanner, with a kind (`parameter`, `plural`, `gender`, `link`, `tag`, `other`) and its compared value. |
| Compared value | What a check compares a token by: a parameter's text, a plural's or gender's parameter, a link's target, a tag's name, anything else's text. |
| Message warning | A difference between a translation's tokens and its source's: `missing`, `unexpected`, or `unbalanced` brackets. Never blocks a save. |

## Rules

### Pairing (`pairCatalog`)

1. The catalog's messages are **the source's, in source order**, each with its documentation and
   its translation.
2. **An empty translation is no translation**, and empty documentation is none: banana-i18n falls
   back to the source for an absent key, and an empty string would show nothing.
3. The translation's messages whose keys the source doesn't have are **not in source**, in the
   translation's order. Documentation for keys the source doesn't have is ignored.
4. A missing target or documentation file pairs as having no messages.

### Checking a translation (`checkMessage`)

1. **Tokens compare as sets, by kind and compared value.** Using `$1` twice in the source and once
   in the translation isn't a difference; neither is the order. A parameter and an `other` with the
   same text are different tokens.
2. **Missing:** a token the source has and the translation doesn't. Reported for every kind.
3. **Unexpected:** a token the translation has and the source doesn't. Reported for every kind but
   `plural` and `gender`: a language can need a plural or a gender its source doesn't (English
   "$1 items" may need `{{PLURAL:$1|…}}` in Hebrew).
4. **The number of plural forms isn't compared**: languages have different numbers.
5. **Unbalanced:** the translation's `{` `}` or `[` `]` don't balance the way the source's do (a
   template or link left open would render broken). Compared with the source, not with zero, so a
   source that's unbalanced on purpose doesn't flag its translations.
6. **An empty translation has nothing to check** (it's missing, not wrong).
7. Warnings come in order: missing ones in source order, unexpected ones in translation order,
   then brackets (`{}` before `[]`). Each difference is reported once.
8. **Warnings never block a save.** The translator may be right (ADR 0009: a Hebrew plural form
   can drop `$1`).

## Invariants

- The domain reads no system's syntax. Plugins scan; this compares what they found, so the same
  checks serve banana-i18n and gettext.
- Keys are kept as written, never normalized.
