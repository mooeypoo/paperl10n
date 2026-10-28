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

Starlight's locale config is JavaScript (`astro.config.mjs`), which a plugin can't run. So this
plugin follows Starlight's conventions by default, and you can name the folders yourself:

- **The source locale:** its own folder if one exists (`src/content/docs/en/`), otherwise the root.
- **A target locale:** the locale id in lowercase (`he` → `he/`, `pt-BR` → `pt-br/`).
- **At the root**, folders named like a two-letter locale code (`he`, `pt-br`, `zh-cn`) belong to
  other locales and aren't source pages. Three-letter names (`api`, `cli`) are pages.

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
- `not-starlight`: no Astro site; opened with `contentDir: "docs"`.

## Not yet

- Reading Starlight's locale list from `astro.config.*` (it's JavaScript; a static read may come
  later, behind the same options).
- A translation with a different extension than its source (`index.md` for `index.mdx`).
