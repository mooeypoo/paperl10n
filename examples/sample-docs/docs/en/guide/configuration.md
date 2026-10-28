---
title: Configuration
---

# Configuration

Lantern works without any configuration. When you want to change something, create
`lantern.config.json` next to your `docs/` folder.

## A minimal config

```json
{
  "title": "My site",
  "logo": "/logo.svg",
  "locales": ["en", "he"]
}
```

## All options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `title` | string | the folder name | Shown in the browser tab and the header. |
| `logo` | string | none | A path to an image in `docs/public/`. |
| `locales` | string[] | `["en"]` | The languages of your site. The first one is the default. |
| `base` | string | `/` | The path the site is served from, for example `/docs/`. |
| `cleanUrls` | boolean | `true` | Serve `/guide/setup` instead of `/guide/setup.html`. |

## Languages

Each locale gets its own folder under `docs/`: `docs/en/`, `docs/he/`, and so on. Lantern sets
the page's `lang` and `dir` attributes for you, so right-to-left languages are laid out correctly.

Pages that aren't translated yet fall back to the default language, with a notice at the top.

## Search

Lantern builds a search index at build time. To leave pages out of search, add
`search: false` to their frontmatter. Search works offline and needs no external service.
