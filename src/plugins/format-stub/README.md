# `@paperl10n/format-stub`

The reference document-format plugin for Paper Lion. It supports the simplest possible layout,
**one folder per locale**, and exists to prove the plugin contract and to show plugin authors
the shape of a plugin. Real systems (VitePress, Starlight, …) get their own plugins.

## Layout

```
<root>/<source-locale>/<key>.md   source documents, e.g. en/guide/getting-started.md
<root>/<target-locale>/<key>.md   translations,     e.g. he/guide/getting-started.md
```

The document key is the path inside the locale folder, without `.md`.

## Options (`paperl10n.config.json`)

```json
{ "formatOptions": { "format-stub": { "root": "docs" } } }
```

| Option | Default | Meaning |
|---|---|---|
| `root` | `""` (the project folder) | The folder that contains the locale folders. Must be inside the project. |

Any other option is rejected with `formats.invalid-options`.

## Detection

`fallback` confidence when a top-level folder named like a locale (`en`, `pt-BR`; a 2–3 letter
language code) holds Markdown files. A layout under a custom `root` isn't detected on its own:
pin it with `"documentFormat": "format-stub"`.

## Files

| File | Purpose |
|---|---|
| `paperl10n-plugin.json` | the manifest |
| `index.ts` | exports `plugin` (manifest + factory) |
| `format-stub.ts` | the implementation; imports only `#plugin-api` |
| `format-stub.test.ts` | the plugin contract kit + fixture tests |
| `fixtures/` | sample projects: `basic`, `docs-root`, `not-a-locale-layout` |
