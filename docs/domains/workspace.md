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
  "formatOptions": { "format-stub": { "root": "docs" } }
}
```

| Key | Required | Meaning |
|---|---|---|
| `sourceLocale` | no (default `en`) | Locale id of the source documents. |
| `targetLocale` | **yes, in M0** | Locale id to translate into. Must differ from the source. Choosing it in the app arrives in M1 ([discussion](../plan/M1-languages.md)). |
| `documentFormat` | no | Pins a document plugin by id instead of detecting one. |
| `formatOptions` | no | Each plugin's own options, keyed by plugin id. The plugin validates its section. |
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
6. Store the opened project in `ProjectSessions` and return a summary: project id, folder name,
   source and target `Locale`s (with direction), format id and name, and config warnings.

### `listSourceDocuments(projectId)`

`createListSourceDocuments({ sessions })`. It returns each source document with its key, source
path, and target path for the project's target locale. Errors: `workspace.unknown-project`, or a
`FormatError` from the layout.

## Ports

| Port | Implemented by | Notes |
|---|---|---|
| `FolderPicker` | `app/` (Electron dialog, step 12) | `pick(): Promise<string \| null>` |
| `ProjectFilesOpener` | `app/` (wraps `openNodeProjectFiles`) | returns the files and the folder's display name |
| `ProjectSessions` | `InMemoryProjectSessions` (`#adapters/workspace/in-memory-project-sessions`) | random UUID ids; contract: `describeProjectSessionsContract` |

Test support (`#domain-testing/workspace`): `FakeFolderPicker`, `FakeProjectFilesOpener`, and the
sessions contract suite. Use-case tests also use `fakeDocumentPlugin` from
`#domain-testing/formats`.

## Invariants

- Absolute paths stay in the main process. Everything after opening refers to the project by id.
- Format choice is workspace policy. The registry only ranks; this domain decides.
- Nothing here names a specific format plugin.

## Later

Locale choice in the UI (M1), catalog formats in projects (M4), external-change detection
(file watching), and remembering recent projects.
