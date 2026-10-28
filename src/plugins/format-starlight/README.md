# `@paperl10n/format-starlight`

Paper Lion's document-format plugin for [Astro Starlight](https://starlight.astro.build) docs
sites: Markdown and MDX pages in `src/content/docs/`, one folder per locale.

## Layout

Starlight keeps each locale's pages in a folder named after its locale key. The default locale is
either the **root** of the content folder or a folder of its own:

```
src/content/docs/index.mdx              root locale (e.g. English)    key: index
src/content/docs/guides/intro.md                                      key: guides/intro
src/content/docs/he/index.mdx           Hebrew translation of "index"
src/content/docs/pt-br/guides/intro.md  Portuguese (Brazil), lowercase folder

src/content/docs/en/index.md            or: the default locale in its own folder
```

The document key is the path inside the locale's folder, without `.md` or `.mdx`. A translation
keeps its source's extension.

## Which folder is which locale

Paper Lion saves BCP 47 locale ids (`pt-BR`); Starlight names folders by its `locales` keys
(`pt-br`, or even `hebrew`), with each locale's BCP 47 tag in `lang`. A locale's folder is found
in this order:

1. **`localeFolders`** in `paperl10n.config.json`, if set.
2. **The `locales` in `astro.config.*`**, read statically, never run: the key is the folder
   (`root`: none), `lang` the locale (defaulting to the key). A config whose locales are built in
   code (a variable, an import, a spread) can't be read this way; the plugin moves on.
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
  "documentFormat": "format-starlight",
  "formatOptions": {
    "format-starlight": {
      "contentDir": "src/content/docs",
      "localeFolders": { "en": "", "he": "he", "pt-BR": "pt-br" }
    }
  }
}
```

| Option | Default | Meaning |
|---|---|---|
| `contentDir` | `src/content/docs` | The folder holding the pages. Must be inside the project. |
| `localeFolders` | conventions above | Locale id → folder name under `contentDir`; `""` is the root. When set, only these folders are treated as other locales' folders. |

Any other option is rejected with `formats.invalid-options`. A target locale that would share the
source locale's folder is refused with `formats.unsupported-project`.

## Detection

`certain` when an Astro config (`astro.config.mjs`, `.ts`, `.mts`, `.js`, `.cjs`) mentions
`@astrojs/starlight` and `src/content/docs/` exists; `likely` with an Astro config and that folder
but no Starlight import. A custom `contentDir` isn't detected; pin the format in the config.

## Fixtures

- `root-locale`: English at the root, Hebrew and Portuguese folders, `.md` and `.mdx`, a
  `reference/api` page (a three-letter folder that isn't a locale), and a missing translation.
- `folder-locales`: English in `en/`, Hebrew in `he/`, an MDX page with an `export`.
- `plain-astro`: an Astro site with the content folder but no Starlight import (`likely`).
- `named-folders`: locales declared in the Astro config: Hebrew in `hebrew/`, `zh-cn` with
  `lang: 'zh-CN'`, and a two-letter `ui/` folder that is pages (the config says so).
- `cased-folders`: locales built in code (unreadable statically), folders `zh-CN/` and `pt-br/`
  found by name, ignoring case.
- `not-starlight`: no Astro site; opened with `contentDir: "docs"`.

## Not yet

- Locales built in code (imported from another module, computed): set `localeFolders`.
- A translation with a different extension than its source (`index.md` for `index.mdx`).
