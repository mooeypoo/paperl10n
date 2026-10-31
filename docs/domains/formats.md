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
| Catalog | A messages folder with one file per locale (banana-i18n's `i18n/en.json`, `i18n/he.json`), and maybe a documentation file (`i18n/qqq.json`). Its folder is its identity, as a key is a page's. A plugin lists them as `SourceCatalog`s. |
| Message key | A message's identity in a catalog (`paperl10n-open-folder`): any non-empty text, as written. Lives in `catalog`. |
| Placeholder token | A piece of a message that must survive translation unchanged: `$1`, `{{PLURAL:…}}`, `%s`, `{name}`, with its kind and what a check compares. A catalog plugin's `placeholders.scan` finds them. |
| Plugin error | An expected failure a plugin returns (`formats.invalid-options`, `formats.unsupported-project`, `formats.invalid-catalog`, `formats.file-access`). |
| Format error | A plugin error as the app sees it: with the plugin's `formatId` added, plus `formats.plugin-failed` for crashes. |

## The contracts (plugin API v3)

### Manifest

```jsonc
{
  "manifestVersion": 1,
  "id": "format-stub",                     // also the config key and the folder name
  "packageName": "@paperl10n/format-stub", // built-ins must use @paperl10n/<id>
  "kind": "document",                      // must match the id prefix
  "apiVersion": 3,
  "version": "0.1.0",
  "displayName": "Folder per locale (stub)",
  "description": "…",
  "license": "GPL-3.0-or-later",
  "author": { "name": "Moriel", "url": "https://moriel.tech" },
  "builtIn": true,
  "capabilities": [],                      // optional features; the API defines none yet
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
  readonly locales: readonly ProjectLocale[];                           // the project's locales, source included
  listSourceDocuments(): Promise<Result<readonly SourceDocument[], PluginError>>;
  targetPathFor(document: SourceDocument, target: LocaleId): Result<ProjectPath, PluginError>;
  sourceLinkTarget?(target: string, locale: LocaleId): string;            // optional (M3)
}

interface ProjectLocale {
  readonly locale: LocaleId;                                            // BCP 47: what Paper Lion saves
  readonly folder: ProjectPath;                                         // where its pages live
}

interface FormatContext {
  readonly files: ProjectFiles;
  readonly sourceLocale: LocaleId;
  readonly options: Readonly<Record<string, unknown>>;                  // the plugin validates these
}
```

`open` is the second phase: the plugin reads the system's own config once (VitePress's `locales`,
for example) and returns a layout bound to this project.

`sourceLinkTarget` (optional, M3) reads a link target as written in a locale's pages in the form
the source's pages would write it (`/he/guide/` → `/guide/` on a site that serves Hebrew under
`/he/`), so the preservation hints don't flag every localized link. Pure; anything it doesn't
recognize comes back unchanged, and the source locale's links always do. The registry's guarded
layout always has it: without the plugin's, a link compares as written.

### `CatalogFormat`

Shaped by M4 (banana-i18n); gettext (M5) fills in the same contract.

```ts
interface CatalogFormat {
  readonly kind: 'catalog';
  detect(files: ProjectFiles): Promise<Detection>;
  open(context: FormatContext): Promise<Result<CatalogLayout, PluginError>>;
  parse(text: string): Result<ParsedCatalog, PluginError>;              // malformed: formats.invalid-catalog
  serialize(edit: CatalogEdit): Result<string, PluginError>;            // patches; untouched bytes stay
  readonly placeholders: { scan(text: string): readonly PlaceholderToken[] };
}

interface CatalogLayout {
  readonly locales: readonly LocaleId[];                                // the catalogs' locales, source included
  listCatalogs(): Promise<Result<readonly SourceCatalog[], PluginError>>;
  targetPathFor(catalog: SourceCatalog, locale: LocaleId): Result<ProjectPath, PluginError>;
}

interface SourceCatalog {
  readonly folder: ProjectPath;                                         // its identity: `i18n`, `i18n/api`
  readonly path: ProjectPath;                                           // the source locale's file, in the folder
  readonly locale: LocaleId;
  readonly documentation?: ProjectPath;                                 // `qqq.json`, when there is one
}

interface ParsedCatalog {
  readonly text: string;                                                // as read; serialize patches it
  readonly messages: readonly Message[];                                // file order, unique keys
}

interface CatalogEdit {
  readonly source: ParsedCatalog;                                       // orders new messages, shapes new files
  readonly target: ParsedCatalog | null;                                // null: the file doesn't exist yet
  readonly changes: readonly MessageChange[];                           // set (key, text) or remove (key)
}
```

**A catalog is a messages folder** with one file per locale. The folder identifies it, as a key
identifies a page; `targetPathFor` puts each locale's file in it, naming the file the system's way
(`pt-br.json` for `pt-BR`). `locales` lists the locales the catalogs have files for (documentation
isn't a locale). Single-file layouts (every locale in one file) aren't supported yet.

**Writing a catalog** patches the file as read. No changes give back the text as read; setting a
message to its current text, or removing one the file lacks, changes nothing; a changed message
changes only its own value. A new message goes after the nearest message before it in the source
that the file has (first, when none does), and a file that doesn't exist yet (`target: null`) is
written like the source, with its messages in source order. The source is passed so the plugin can
do both. Format details (indentation, escaping, line endings, metadata) are the plugin's to keep.

**Placeholder tokens** have a kind, and carry what a check compares between a source message and
its translation:

| Kind | Examples | Compared by |
|---|---|---|
| `parameter` | `$1`, `%s`, `%1$s`, `{name}` | its text |
| `plural` | `{{PLURAL:$1\|…}}` | `parameter`: the parameter it depends on, as written (`$1`) |
| `gender` | `{{GENDER:$1\|…}}` | `parameter`, as written (empty when it has none) |
| `link` | `[[Page\|text]]`, `[https://… text]` | `target`, as written |
| `tag` | `<b>`, `</b>` | `name`, lowercased |
| `other` | `{{SITENAME}}`, `{{int:…}}` | its text |

Tokens come in order of their start (an enclosing token before those inside it), each with its
text and UTF-16 range. They may nest (a parameter inside a plural, a plural inside a link) but never
partly overlap. Validation over these tokens belongs to the `catalog` domain, so it needs no format
code.

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

Two implementations pass that suite. `InMemoryProjectFiles`
(`#adapters/formats/in-memory-project-files`) holds a tree in memory: tests use it as a fake
(through `#domain-testing/formats` or `#plugin-api/testing`), and the browser UI harness uses it as
its file system ([ADR 0015](../adr/0015-browser-ui-harness.md)). The disk implementation is
`openNodeProjectFiles(root)` (`#adapters/formats/node-project-files`, for `app/` only). It resolves symlinks. A link to a file inside the project is listed and readable;
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

## Locale codes and folders

**Paper Lion always works with BCP 47 locale ids** (`pt-BR`, `zh-Hans`), the code it saves. **Each
system names its locale folders its own way, and the plugin owns that mapping.** Nearly every docs
system separates the two (checked 2026-10-28):

| System | Folder name | Language tag | Default locale |
|---|---|---|---|
| Starlight | the `locales` key (`'zh-cn'`, `hebrew`) | `lang` (BCP 47), defaults to the key | `root`: no folder |
| Astro i18n | each `locales` string, or a `path` (`french`) | `codes` (browser tags) | usually no folder |
| VitePress | the `locales` key | `lang` | `root`: no folder |
| Nuxt i18n | `code` (any id) | `language` (BCP 47) | |
| Docusaurus | the locale name, or `path` (`i18n/<locale>/<plugin>/…`) | `htmlLang` (BCP 47) | |
| Hugo | `contentDir`, or a file-name suffix (lowercase) | its own setting | |

So a plugin must never assume "folder = code". It reports the project's locales as
`ProjectLocale`s (locale id + folder), and `targetPathFor` puts a locale's pages in that folder
(the contract kit checks both). Where the system's config is code (`astro.config.mjs`), the plugin
reads what it can statically and never runs it.

## Versioning

- **`apiVersion`** in the manifest is the plugin API version the plugin was written for. The
  manifest validator accepts only versions this app supports (`SUPPORTED_API_VERSIONS`, now
  `[3]`), and the registry passes the host's version to `create(host)`. Version 2 (M1) replaced
  `declaredLocales` with `locales: ProjectLocale[]`. Version 3 (M4) reshaped `CatalogFormat` from
  its sketch: catalogs identified by their folder, the layout's `locales`, `serialize` taking a
  `CatalogEdit`, typed placeholder tokens, `messageKey`, and the `formats.invalid-catalog` error.
  No plugins outside this repository existed yet, so neither kept the older version.
- Adding an optional capability, or a field to `PluginHost`, is not breaking: plugins keep
  working. (M3 added `DocumentLayout.sourceLinkTarget` this way, within version 2.) Removing or changing anything a plugin can see is breaking, needs a new `apiVersion`,
  and shows up as a diff in the frozen export list (`plugin-api.test.ts`).
- `manifestVersion` versions the manifest's own shape, separately from the API.
- `version` is the plugin's own semantic version.

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

It imports only `#plugin-api`, plus the npm packages listed in `externalDependencies`. Its tests
may also import `#plugin-api/testing` and `vitest`, and nothing else. Lint enforces all of this
per plugin, reading each manifest (`scripts/eslint/architecture.ts`), so a plugin and its tests
can always move out together. [`src/plugins/format-stub/`](../../src/plugins/format-stub/) is the
reference plugin; read its README and `format-stub.ts` first.

### The plugin contract kit

Every plugin's test file calls it once:

```ts
import { describePluginContract } from '#plugin-api/testing';
import { plugin } from './index.ts';

describePluginContract(plugin, {
  folder: new URL('.', import.meta.url).pathname,
  fixtures: [
    { name: 'basic', root: fixture('basic'), sourceLocale: 'en', targetLocales: ['he'], detected: true },
  ],
});
```

It checks, through the registry's guarded views (so a crash reads as `formats.plugin-failed`):

- the manifest is valid, its `id` equals the folder name, and the plugin registers with the kind
  its manifest declares;
- on an empty project, `detect` returns a result and `open` returns a layout or a plugin error,
  never a crash;
- options it doesn't understand produce `formats.invalid-options`;
- per fixture: detection matches the expectation, the same way every time.

For a **document plugin**, per fixture: source documents come in a stable order, with unique keys,
in the source locale, and exist; each maps to itself for the source locale; target paths are
distinct and never a source path; link targets map without failing, and the source locale's come
back as written.

For a **catalog plugin**, per fixture:

- catalogs come in a stable order, each folder once, in the source locale, with the source and
  documentation files existing in the folder; the locales are listed once each, the source's
  included;
- each catalog maps to its own file for the source locale, and to distinct files in its folder,
  never a source or documentation file, for the others (the listed locales and `targetLocales`);
- **round trip:** every existing file (source, each listed locale's, documentation) parses with
  unique keys, and writing it with no changes gives back its text byte for byte;
- **writing only what changed**, on each locale's file, for its first and last message: setting it
  to its own text, or removing a key the file lacks, changes nothing; setting it changes only that
  message, and setting it back restores the file byte for byte; removing it removes only it; a
  message added back goes after the nearest message before it in the source; a new file has its
  messages in source order;
- **scanning** every message in the fixture, and a set of tricky texts (unbalanced syntax,
  nesting, lone surrogates, other systems' placeholders): tokens are inside the text, match it, come
  in order, nest or stay apart, and are the same every time;
- malformed text parses to `formats.invalid-catalog`, never a crash.

The kit itself is tested against deliberately broken plugins (`testing/plugin-contract.test.ts`),
with `fakeCatalogPlugin` (a `key=value` line format, in `#domain-testing/formats`) as the
well-behaved catalog plugin. Adding a check means adding a broken-plugin case for it.

## Extracting a plugin into a package (when it's needed)

1. Publish `src/domains/formats/plugin-api.ts` + `plugin-api-testing.ts` as `@paperl10n/plugin-api`
   (they contain only types and small kernel helpers).
2. Move the plugin folder into its own package. Generate `package.json` from the manifest
   (`name` = `packageName`, `version`, `license`, `author`, `description`, `dependencies` from
   `externalDependencies`).
3. Replace `#plugin-api` with `@paperl10n/plugin-api` in its imports.
4. Run its tests: the contract kit and fixtures travel with it.
