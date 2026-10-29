# Domain: `workspace`

Opening a project folder, reading its config, choosing its document format, and discovering what
there is to translate. Code: `src/domains/workspace/`, public API `#domains/workspace`.

## Ubiquitous language

| Term | Meaning |
|---|---|
| Project | A folder the user opened, plus its `paperl10n.config.json`. |
| Project config | `paperl10n.config.json` at the project root (format below). |
| Opened project | A project open in this app session: its files, config, locales, document format, and layout. Lives in the main process only. |
| Project id | An opaque, random handle for an opened project. The renderer holds this, never a file path. |
| Source document entry | A source document plus where its translation lives (or will live) for the target locale. |

## Config file, version 0

```json
{
  "sourceLocale": "en",
  "targetLocale": "he",
  "documentFormat": "format-stub",
  "formatOptions": { "format-stub": { "root": "docs" } },
  "languages": { "rhg": { "dir": "ltr" }, "art-x-lantern": { "name": "Lanternese", "dir": "rtl" } }
}
```

| Key | Required | Meaning |
|---|---|---|
| `sourceLocale` | no (default `en`) | Locale id of the source documents. |
| `targetLocale` | no | Locale id to translate into. Must differ from the source. Without it the project opens with no target, and the app asks for one ([M1 languages](../plan/M1-languages.md)). |
| `documentFormat` | no | Pins a document plugin by id instead of detecting one. |
| `formatOptions` | no | Each plugin's own options, keyed by plugin id. The plugin validates its section. |
| `languages` | no | Languages the project defines or adjusts, keyed by locale id: `name` and/or `dir` (`ltr`/`rtl`). Adds codes the language catalog doesn't know, or fixes a direction. Shared with the team, so nothing is guessed silently (M1). |
| `$schema` | no | Ignored (editor support). |

Unknown keys produce **warnings**, not errors, so a newer config still opens in an older app. All
problems are reported at once (`workspace.config-invalid`, with a list of `{ field, problem }`).

## Use cases

### `openProject()`

`createOpenProject({ folderPicker, opener, registry, sessions })`:

1. Ask the `FolderPicker` for a folder. Cancel → `ok(null)`.
2. Open it with the `ProjectFilesOpener` → `workspace.folder-unavailable` if that fails.
3. Read `paperl10n.config.json` → `workspace.config-missing`, `workspace.config-unreadable`, or
   `workspace.config-invalid`.
4. Choose the document format: **a format pinned in the config wins**
   (`workspace.unknown-document-format` if it isn't an installed document plugin); otherwise
   **the best-ranked detection** (`workspace.no-document-format`, with any detection failures).
5. Open the format's layout with the plugin's own options. A `FormatError` passes through as is.
6. Build the project's **language catalog**: the bundled catalog plus the config's `languages`
   and any locale folder whose code the catalog doesn't know (so every language already in the
   project can be shown and chosen).
7. Store the opened project in `ProjectSessions` and return a summary: project id, folder name,
   source and target `Locale`s (with direction; the target is `null` when the config has none),
   format id and name, and config warnings.

### `listSourceDocuments(projectId)`

`createListSourceDocuments({ sessions })`. It returns each source document with its key, source
path, target path for the project's target locale, and whether that translation file exists
(`targetExists`). Errors: `workspace.unknown-project`, `workspace.no-target-locale` (no target
chosen yet), or a `FormatError` from the layout.

### `readDocumentPair(projectId, key)`

`createReadDocumentPair({ sessions, parser })`. It finds the page by key among the layout's source
documents, reads the source and the translation, and parses both with the `MarkdownParser` port
(`#domains/document`; `.mdx` files with MDX tolerance, and each read document says `mdx` so the
editor parses it the same way). A translation that doesn't exist yet is `null`, not an error. Errors: `workspace.unknown-project`, `workspace.no-target-locale`,
`workspace.unknown-document` (the key
isn't listed), `workspace.document-unreadable` (with the file problem, also for a listed source
file that vanished), or a `FormatError`.

### `saveDocument(projectId, { key, text, base })`

`createSaveDocument({ sessions })`. Writes a page's translation, for the project's target locale,
exactly as given, through the `ProjectWriter` (atomic; missing folders created, so a new
language's first page can be saved). `base` is the translation as it was when editing started, or
`null` when it didn't exist (a page seeded from its source). Two guarantees from PRD §7.4:

- **No needless writes:** text equal to the file isn't written (`written: false`).
- **No overwriting someone else's change:** if the file on disk is no longer `base` (git pull,
  another editor, a deleted file, or a file created since a seeded page was opened), nothing is
  written and the result is `workspace.document-changed`. The UI decides what to offer.

Errors: `workspace.unknown-project`, `workspace.no-target-locale`, `workspace.unknown-document`,
`workspace.document-changed`, `workspace.document-unreadable`, `workspace.document-unwritable`
(with the file problem), or a `FormatError`.

### Target languages: `suggestTargetLanguages`, `searchTargetLanguages`, `chooseTargetLocale`

What the language picker needs, all on the open project's catalog and never offering the source:

- `suggestTargetLanguages(projectId, { recent, systemLanguages, uiLanguage })`: the picker's
  sections before the user types. **In this project** (its locales, the config's `languages`, the
  current target), **recent** (the user's picks, kept by the UI), and **suggested** (English, the
  OS languages, the region's most spoken). Rules: `suggestLanguages` in `#domains/locale`.
- `searchTargetLanguages(projectId, { query, uiLanguage })`: up to 50 matches, best first
  (`searchLanguages`).
- Both return `LanguageEntry`s: tag, name in the interface language (English as a fallback),
  autonym, and direction.
- `chooseTargetLocale(projectId, language)`: makes a language the target, by tag or alias,
  ignoring case, and returns its `Locale`. Errors: `workspace.unknown-language` (the catalog
  doesn't know it: define it in the config's `languages` first), `workspace.target-is-source`.
  It **saves the choice** as `targetLocale` in `paperl10n.config.json`, so the team shares it:
  the file is read again as it is on disk now, only that value changes (`setConfigString`,
  below), and it's written through the `ProjectWriter`. Nothing is written when the config
  already says so. Save errors: `workspace.config-missing`, `workspace.config-unreadable`,
  `workspace.config-invalid` (the file changed since opening), `workspace.config-unwritable`.
  The session changes only after the file is saved.

Errors common to all three: `workspace.unknown-project`.

### Editing the config: `setConfigString(text, key, value, { after })`

Pure (`domain/config-edit.ts`). Sets one top-level string value and keeps every other byte: the
user's spacing, key order, line endings, a BOM, and keys Paper Lion doesn't know. An existing key
keeps its place (the last one, if the key repeats, as JSON readers use the last). A new key goes
right after `after` (`sourceLocale`), or first, copying the file's own spacing. As a safety net,
the result is parsed and must equal the old content with only that value changed.

Pairing *within* a page (sections, PRD §7.2) belongs to the `translation` domain from M3. Reading
the two files is workspace's job: it holds the open project's files and layout.

## Ports

| Port | Implemented by | Notes |
|---|---|---|
| `FolderPicker` | `createDialogFolderPicker` (`#adapters/workspace/dialog-folder-picker`, with Electron's dialog injected) | `pick(): Promise<string \| null>`; contract: `describeFolderPickerContract` |
| `ProjectFilesOpener` | `nodeProjectOpener` (`app/node/`, wraps `openNodeProjectFiles`); the UI harness's `fixtureOpener` | returns the files, a `ProjectWriter`, and the folder's display name; contract: `describeProjectFilesOpenerContract` |
| `ProjectWriter` | `nodeProjectWriter` (`#adapters/workspace/node-project-writer`); `InMemoryProjectFiles` (tests, UI harness) | `writeText(path, text, { createFolders })`, atomic: a temporary file next to the target, flushed, then renamed over it. Writes through a symlink only to a file inside the project; keeps an existing file's permissions. With `createFolders`, missing folders are created one at a time, each checked to be a real folder inside the project (`files.not-a-directory` when a file is in the way). Only the app writes; plugins only read. Contract: `describeProjectWriterContract` |
| `ProjectSessions` | `InMemoryProjectSessions` (`#adapters/workspace/in-memory-project-sessions`) | random UUID ids; `update` replaces a stored project (choosing a target); contract: `describeProjectSessionsContract` |

Test support (`#domain-testing/workspace`): `FakeFolderPicker`, `FakeProjectFilesOpener`, and the
four contract suites, which run against the fakes and every real implementation. Use-case tests also use `fakeDocumentPlugin` from
`#domain-testing/formats`.

## Invariants

- Absolute paths stay in the main process. Everything after opening refers to the project by id.
- Format choice is workspace policy. The registry only ranks; this domain decides.
- Nothing here names a specific format plugin.

## Later

Choosing the source language and naming unknown codes from the app (M1 follow-ups), catalog formats in projects (M4), external-change detection
(file watching), and remembering recent projects.
