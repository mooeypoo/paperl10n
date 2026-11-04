# Domain: `updates`

Noticing that a newer Paper Lion is out ([ADR 0018](../adr/0018-updates-domain.md), M6). Code:
`src/domains/updates/`, public API `#domains/updates`. It depends on no other domain.

Paper Lion never downloads or installs anything. It learns that a newer version exists and
links to it, the same as Plot Device.

## Ubiquitous language

| Term | Meaning |
|---|---|
| `latest.json` | The file attached to every release that describes it: `format` (1), `version`, `date`, `notes` (the release's page), and `download` (by interface language; `en` is always there). Read from `https://github.com/mooeypoo/paperl10n/releases/latest/download/latest.json`, which GitHub sends to the newest published release. |
| Release version | A plain `x.y.z`. Nothing else is ever newer, so a pre-release is never mentioned. |
| Check | Asking for `latest.json`. It either answers a release or is *unreachable* (offline, a redirect to another host, too big, too slow, or not a file this version can read). |
| Automatic check | The daily check. It runs only when one is due, only while the setting is on, and only in a release (or in development with a test server). |
| Due | Never checked, a day has passed since the last answer, or the last answer is in the future (the clock was set back). |
| Notice | The newer version to mention: newer than the running one, not dismissed, and the setting on. |
| Dismiss ("Not now") | Stop mentioning that version, across restarts. A later version is mentioned again. |
| Check for updates | The check the user asks for in About. It runs whatever the setting, and it reports a dismissed version too. |

## Public API

```ts
parseLatestRelease(value: unknown): LatestRelease | null   // the file's contents, or null
isNewerVersion(candidate: string, current: string): boolean
createUpdates({ source, store, currentVersion, automaticAllowed, now }): Updates
  // status(), checkNow(), dismiss(version), setAutomatic(enabled)
```

Ports: `UpdateSource` (the newest release, or `'unreachable'`) and `UpdateStateStore` (the saved
state's text). Adapters:
- `githubUpdateSource`: `fetch` in main, redirects followed by hand only to GitHub's hosts,
  64 KB at most, 10 s;
- `nodeUpdateStateStore`: `updates.json` in the app's data, written atomically;
- `InMemoryUpdateStateStore`: for the UI harness.

## Invariants

- **Nothing about the user is sent:** no identifier, no version, no cookies. The address is the
  same for everyone.
- **A failed check is quiet.** It changes nothing saved, and the next status request tries again
  when one is due.
- **Anything unexpected in `latest.json` is ignored, never shown:** another `format`, a link
  that isn't `https`, downloads without English. Main checks each link against its allow-list
  again before opening it.
- **The saved state is a cache.** It's read field by field and leniently, and a store that can't
  be read or written leaves the state in memory.
- **One check at a time.** Asking again while a check runs waits for that check.
- **The renderer asks and main decides:** on startup and every six hours, the page asks for the
  status, and main fetches only when a check is due.
