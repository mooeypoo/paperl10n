# `@paperl10n/format-vitepress`

Paper Lion's document-format plugin for [VitePress](https://vitepress.dev) sites: Markdown pages
in the site's source folder, one folder per locale.

## Layout

A VitePress site is the folder holding `.vitepress/` (the project itself, or a folder in it such
as `docs/`). Its pages are under the source folder: the site's folder, or its `srcDir`. The
`root` locale's pages are at the top of the source folder, and each other locale's are in a
folder named by its `locales` key:

```
.vitepress/config.mts
index.md                     root locale (e.g. English)    key: index
guide/getting-started.md                                   key: guide/getting-started
he/index.md                  Hebrew translation of "index"
pt-br/guide/getting-started.md  Portuguese (Brazil)

docs/.vitepress/config.ts    or: the site in docs/, with srcDir: './src'
docs/src/index.md
docs/src/he/index.md
```

The document key is the path inside the locale's folder, without `.md`. VitePress has no MDX.
Pages inside dot-folders (`.vitepress/`, `.github/`) and in `public/` at the source root (static
files) aren't pages.

## Finding the site

The site's folder is the `siteDir` option, else the first of these with a `.vitepress/config.*`
(or `.vitepress/config/index.*`; `.mts`, `.ts`, `.mjs`, `.js`, `.cts`, `.cjs`): the project
itself, `docs/`, `doc/`, `website/`, `site/`, `documentation/`. A site anywhere else needs
`siteDir`, and its format pinned in `paperl10n.config.json` (detection doesn't search deeper, so
it stays cheap on large projects).

The source folder is the `srcDir` option, else the config's `srcDir` when it's a plain string,
else the site's folder. A `srcDir` built in code is ignored.

## Which folder is which locale

Paper Lion saves BCP 47 locale ids (`pt-BR`); VitePress names folders by its `locales` keys
(`pt-br`), with each locale's tag in `lang`. A locale's folder is found in this order:

1. **`localeFolders`** in `paperl10n.config.json`, if set.
2. **The `locales` in the config**, read statically, never run (`findStaticProperties` from the
   plugin API). Every key is a folder (`root`: none), whatever its entry holds. Its locale is the
   entry's `lang` when that's a plain string, else the key. VitePress's own docs build each
   entry with a spread (`{ label: 'English', ...en }`), which is fine: the key still names the
   folder. The site's `locales` is the shallowest one in the config; the search options have
   their own, deeper in. A `locales` built in code (a variable, a spread among the keys) can't be
   read this way, and the plugin moves on.
3. **An existing folder with that name, ignoring case:** `zh-CN/` for `zh-CN`, `pt-br/` for `pt-BR`.
4. **For the source locale, the root;** for others, **the locale id in lowercase** (`he` → `he/`).

At the root, other locales' folders aren't source pages: the declared ones (1 or 2), or, without a
declaration, folders named like a two-letter locale code (`he`, `pt-br`, `zh-cn`). Three-letter
names (`api`, `cli`) are pages either way.

The plugin reports the project's locales (`layout.locales`): the source locale, then the declared
ones, or the existing locale-like folders.

## Options (`paperl10n.config.json`)

```json
{
  "documentFormat": "format-vitepress",
  "formatOptions": {
    "format-vitepress": {
      "siteDir": "docs",
      "srcDir": "src",
      "localeFolders": { "en": "", "he": "he", "pt-BR": "pt-br" }
    }
  }
}
```

| Option | Default | Meaning |
|---|---|---|
| `siteDir` | found (above) | The folder holding `.vitepress/`. Must be inside the project. |
| `srcDir` | the config's, else none | The source folder, relative to the site's. |
| `localeFolders` | conventions above | Locale id → folder name under the source folder; `""` is the root. When set, only these folders are treated as other locales' folders. |

Any other option is rejected with `formats.invalid-options`. A target locale that would share the
source locale's folder is refused with `formats.unsupported-project`, and so is a project with no
config (unless `siteDir` is set) or a source folder that doesn't exist.

## Links in a translation (`sourceLinkTarget`)

VitePress serves a locale's pages under its folder's name (`/he/guide/`), and the root locale's at
the root. (A locale's `link` in the config only sets the navbar's language menu.) For the
preservation hints, a translation's link whose first path segment is its locale's folder
(ignoring case) is read in the source's form: that segment is dropped when the source is at the
root (`/he/guide/` → `/guide/`), or swapped for the source's folder (`/he/guide/` →
`/en/guide/`). `.md` and `.html` suffixes stay as written. Relative links, other sites, and later
segments are left as written. A site `base` isn't known, so links under one compare as written.

## Detection

`certain` when a site's config (found as above) mentions `vitepress`; `likely` when it doesn't.

## Fixtures

- `root-locale`: English at the root, Hebrew and Portuguese folders, a home page whose text is all
  frontmatter, and a guide using VitePress's Markdown (containers, a code group, line highlights,
  `[!code ++]`, `[[toc]]`, emoji, `{{ }}` interpolation, `<script setup>`, `<style module>`, a
  code import `<<<`, and an `@include`). `public/` and `.vitepress/` hold Markdown that isn't
  pages, and the search options have their own `locales`.
- `docs-site`: the site in `docs/` with `srcDir: './src'`, its locales built with spreads, and a
  README at the project root that isn't a page.
- `folder-locales`: English in `en/`, Hebrew in `he/`, and a root page that redirects.
- `built-locales`: `locales` from an import (unreadable statically), folders `zh-CN/` and
  `pt-br/` found by name, and an `api/` folder that is pages.
- `plain-config`: a `.vitepress/config.js` that never names VitePress (`likely`).
- `not-vitepress`: no config; opened with `siteDir: "site"`.

## Not yet

- **`rewrites`:** a rewrite changes the URL a file serves, not where its translation lives, so
  pairing doesn't need it; links under a rewritten path compare as written.
- **`srcExclude`:** excluded files are still listed. Move them out of the source folder, or set
  `srcDir`.
- **A locale's `dir`:** Paper Lion takes each language's direction from its own catalog.
- A site `base` in link targets, and sites deeper than one folder down without `siteDir`.
