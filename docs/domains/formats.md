# Domain: `formats`

The format plugin system: the contracts every supported translation system implements, the
manifest that describes a plugin, and the registry that loads plugins and keeps their failures
contained. Code: `src/domains/formats/`. Core code imports `#domains/formats`; **plugins import
only `#plugin-api`**.

Core code never names a specific system. There's no `if (format === 'vitepress')` anywhere: a new
system is a new plugin plus fixtures, with zero changes to domain code.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Format plugin | Code + manifest that teaches Paper Lion one system. Two kinds: **document** (`format-<system>`, longform: VitePress, Starlight, …) and **catalog** (`catalog-<system>`, interface strings: banana-i18n, gettext, …). |
| Manifest | `paperl10n-plugin.json`: what a plugin *is* (id, kind, versions, author, license, dependencies). Data, validated by `parsePluginManifest`. |
| Plugin module | What a plugin's `index.ts` exports as `plugin`: `{ manifest, create(host) }`. |
| Detection | A plugin's answer to "is this project yours?": no match, or a match with a confidence (`certain`, `likely`, `fallback`) and evidence files. |
| Layout | Where a system keeps documents (or catalogs) for each locale. A plugin's `open()` returns one, bound to the project. |
| Document key | The locale-independent identity of a document (`guide/getting-started`), shared by a source and its translations. Lives in `document`. |
| Project files | The read-only view of the project a plugin gets (`ProjectFiles`). The only way a plugin sees the disk. |
| Plugin error | An expected failure a plugin returns (`formats.invalid-options`, `formats.unsupported-project`, `formats.file-access`). |
| Format error | A plugin error as the app sees it: with the plugin's `formatId` added, plus `formats.plugin-failed` for crashes. |

## The contracts (plugin API v1)

### Manifest

```jsonc
{
  "manifestVersion": 1,
  "id": "format-stub",                     // also the config key and the folder name
  "packageName": "@paperl10n/format-stub", // built-ins must use @paperl10n/<id>
  "kind": "document",                      // must match the id prefix
  "apiVersion": 1,
  "version": "0.1.0",
  "displayName": "Folder per locale (stub)",
  "description": "…",
  "license": "GPL-3.0-or-later",
  "author": { "name": "Moriel", "url": "https://moriel.tech" },
  "builtIn": true,
  "capabilities": [],                      // optional features; API v1 defines none yet
  "externalDependencies": []               // npm packages the plugin may import
}
```

The validator reports every problem at once and drops unknown fields. A **capability** is an
optional feature with its own interface method. Each one is added to `KNOWN_CAPABILITIES` together
with that method (likely first: `frontmatter-rules`, then `dialect`), and the registry then checks
that a plugin declaring it implements it.

### `DocumentFormat`

```ts
interface DocumentFormat {
  readonly kind: 'document';
  detect(files: ProjectFiles): Promise<Detection>;                       // cheap; no full-tree reads
  open(context: FormatContext): Promise<Result<DocumentLayout, PluginError>>;
}

interface DocumentLayout {
  readonly declaredLocales: readonly LocaleId[];                        // if the system declares them
  listSourceDocuments(): Promise<Result<readonly SourceDocument[], PluginError>>;
  targetPathFor(document: SourceDocument, target: LocaleId): Result<ProjectPath, PluginError>;
}

interface FormatContext {
  readonly files: ProjectFiles;
  readonly sourceLocale: LocaleId;
  readonly options: Readonly<Record<string, unknown>>;                  // the plugin validates these
}
```

`open` is the second phase: the plugin reads the system's own config once (VitePress's `locales`,
for example) and returns a layout bound to this project.

### `CatalogFormat` (sketch)

Defined so the manifest and registry handle both kinds from the start. No plugin implements it
until M4. It has `detect`, `open` → `CatalogLayout` (`listCatalogs`, `catalogPathFor`), `parse`,
`serialize(original, changes)` (patches the original text, so untouched bytes stay identical),
and `placeholders.scan(text)`.

### `ProjectFiles`

```ts
interface ProjectFiles {
  list(dir: ProjectPath, filter?: { extensions?: readonly string[] }): Promise<Result<readonly ProjectPath[], FileAccessError>>;
  readText(path: ProjectPath): Promise<Result<string, FileAccessError>>;
  exists(path: ProjectPath): Promise<boolean>;
}
```

The behavior is specified by the contract suite `describeProjectFilesContract`: recursive, sorted,
project-relative listings; `.git` and `node_modules` skipped at any depth (other dot-folders such as
`.vitepress` are kept); text returned exactly as stored (BOM and CRLF kept); UTF-8 only. Errors:
`files.not-found`, `not-a-directory`, `not-a-file`, `not-utf8`, `unreadable`, `outside-project`.

The disk implementation is `openNodeProjectFiles(root)` (`#adapters/formats/node-project-files`,
for `app/` only). It resolves symlinks. A link to a file inside the project is listed and readable;
anything whose real location is outside the project is never listed, and reading it gives
`files.outside-project`. Symlinked folders aren't followed when listing, which also rules out
loops. Opening a missing or non-folder root fails with `files.root-not-found` or
`files.root-not-a-directory`.

## The registry

`createFormatRegistry(modules, host)` validates every manifest, creates every plugin, and fails
with **all** problems at once (`manifest-invalid`, `duplicate-id`, `create-failed`,
`kind-mismatch`). A broken plugin set is a bug to fix before the app runs.

The registry hands out **guarded views** (`RegisteredDocumentFormat`, `GuardedDocumentLayout`,
…): every call returns a `Result`. A plugin that throws or rejects produces
`formats.plugin-failed` instead of crashing the app, and errors a plugin returns get its
`formatId` attached. `detect(files)` runs every plugin concurrently and returns
`{ matches, failures }`, with matches ranked by confidence, then id.

Choosing which format to use (a config pin beats detection, and so on) is the `workspace`
domain's policy, not the registry's.

## Invariants

- **Plugins are pure.** They see the disk only through `ProjectFiles`, and never import `fs`,
  Electron, other plugins, or core internals (enforced by lint).
- **Plugins never need to throw.** Expected failures are `PluginError` results. Throwing is a bug,
  and the registry contains it.
- **Paths are `ProjectPath`s:** project-relative, never escaping the project.
- **Identity lives in the manifest.** Plugin code doesn't repeat its id or name.
- **The plugin API is frozen by a test** (`plugin-api.test.ts`). Changing what plugins can see is a
  deliberate diff. Breaking changes need a new `apiVersion`.

## Writing a plugin

A plugin is a self-contained folder `src/plugins/<id>/` (see `AGENTS.md`, "Formats are plugins"):

```
src/plugins/format-example/
├─ paperl10n-plugin.json   manifest
├─ index.ts                export const plugin: PluginModule = { manifest, create }
├─ format-example.ts       the implementation
├─ format-example.test.ts  the contract kit + fixture tests
├─ fixtures/…              sample projects
└─ README.md
```

It imports only `#plugin-api` (and `#plugin-api/testing` in tests), plus the npm packages listed
in `externalDependencies`. `format-stub` (M0 step 9) is the reference walkthrough. The plugin
contract kit (step 9) checks the invariants every plugin must hold.

## Extracting a plugin into a package (when it's needed)

1. Publish `src/domains/formats/plugin-api.ts` + `plugin-api-testing.ts` as `@paperl10n/plugin-api`
   (they contain only types and small kernel helpers).
2. Move the plugin folder into its own package. Generate `package.json` from the manifest
   (`name` = `packageName`, `version`, `license`, `author`, `description`, `dependencies` from
   `externalDependencies`).
3. Replace `#plugin-api` with `@paperl10n/plugin-api` in its imports.
4. Run its tests: the contract kit and fixtures travel with it.
