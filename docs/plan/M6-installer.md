# M6 discussion: installers, releases, and update notices

Status: **open for discussion.** The maintainer's first decisions are in the table below; the
questions after it each have a recommendation. Answers go into the "Decided" table, as in M4 and
M5.

Goal: a translator downloads Paper Lion and opens it like any other app, with no Node, pnpm, or
clone, and the app tells them when a newer version is out. Today it runs only from source
(`pnpm dev`); `pnpm build` writes JavaScript into `out/`, which still needs Electron from
`node_modules`.

This follows what Plot Device already does (its Milestone 7, installers, and Milestone 15, the
first release and update notices), so the two apps release and update the same way.

## Decided (2026-11-03)

| Topic | Decision |
|---|---|
| Platforms | **Linux first, Windows second, macOS planned** (not built in M6). |
| Linux formats | **A `.deb` and an AppImage**, unless there's an issue with that (there is one, for the AppImage on Ubuntu: question 3). |
| Signing | **None for now.** Signing Windows and macOS builds is a later decision, for Paper Lion and Plot Device together. |
| Updates | **Update notices as in Plot Device:** a `latest.json` attached to each GitHub release, read from the address that always points to the newest published release, `https://github.com/mooeypoo/paperl10n/releases/latest/download/latest.json`. The app says a newer version is out and links to it; it doesn't install anything itself. |

## Where M5 left us

- **The app's identity is partly set:** `productName` is "Paper Lion", the app id is
  `io.github.mooeypoo.paperl10n` (`src/main/index.ts`, used for Windows' taskbar), and settings and
  drafts live in a `paperl10n` folder in the OS's app data.
- **Icons:** `assets/icons/` has the mark at 16 to 512 px, already meant for Linux's hicolor set.
- **The version is `0.0.0`.** There's no changelog, no About window, and no release workflow.
- **CI** runs the checks and the end-to-end tests on Linux (`ubuntu-24.04`, `ubuntu-latest`),
  lifting Ubuntu's AppArmor restriction so Electron's sandbox stays on (see
  `docs/development/linux-sandbox.md`).
- **Packaging was deferred in M0**, "probably electron-builder" (`docs/plan/M0.md`, ADR 0002).

## Questions to decide

### 1. The release identity

| | Value (recommended) |
|---|---|
| App id | `io.github.mooeypoo.paperl10n` (already the app's; Linux desktop entry and AppStream id too) |
| Name | Paper Lion |
| Executable, Linux package, file names | `paperl10n` (`paperl10n_0.1.0_amd64.deb`, `paperl10n-0.1.0.AppImage`, `paperl10n-0.1.0-setup.exe`) |
| Settings folder | `paperl10n`, as now. Development (`pnpm dev`) moves to `paperl10n-dev`, so trying a release never mixes with a development profile's drafts |
| First version | `0.1.0` |

These must not change after the first release: Windows upgrades and the settings folder depend
on them. **Recommendation:** as in the table.

### 2. The packaging tool

**`electron-builder`** (MIT, compatible with GPL-3.0), as M0 planned and as Plot Device uses: one
configuration for the AppImage, the `.deb`, and the Windows installer, and Plot Device's
configuration is a tested starting point. It's a new development dependency, so it's yours to
approve. The alternative, Electron Forge, adds a second configuration model (makers, publishers)
for no gain here (ADR 0002 already weighed it).

**Recommendation:** electron-builder.

### 3. Linux: the sandbox, and the AppImage on Ubuntu

Paper Lion always runs its renderer in Chromium's sandbox (ADR 0006), and Ubuntu 23.10+ blocks
the sandbox for a program without an AppArmor profile (`docs/development/linux-sandbox.md`).
Chromium then stops rather than run unsandboxed.

- **The `.deb` is fine.** It installs the app in `/opt`, where it can use Chromium's setuid
  sandbox helper (`chrome-sandbox`, made setuid root on install) or an AppArmor profile installed
  with the package. Which of the two electron-builder's `.deb` sets up today is the first thing to
  verify in step I1; either way, the sandbox stays on.
- **The AppImage has a real problem on Ubuntu 23.10+.** It runs from a temporary mount point, so
  an AppArmor profile can't name it, and it can't make its helper setuid. On Ubuntu, a downloaded
  AppImage would stop at launch. On other distributions (Fedora, Arch, Debian) it works. Plot
  Device's tests sidestep this (`--no-sandbox` locally, the restriction lifted in CI), but a user
  can't.

| Option | Notes |
|---|---|
| **A. Build both; the `.deb` for Ubuntu and Debian, the AppImage for other distributions** (recommended) | The release notes and README say so plainly. The AppImage's launcher (its `AppRun`) checks for the restriction first and, if it's on, shows a short message (a dialog when it can, else the terminal) pointing to the `.deb`, instead of failing silently. The sandbox is never turned off. |
| B. Build both, and have the AppImage turn the sandbox off on Ubuntu | It would start everywhere, but with the renderer unsandboxed, which ADR 0006 rules out: a document is untrusted input. |
| C. The `.deb` only | Simple, but nothing for Fedora or Arch users. |

**Recommendation: A.**

### 4. Windows

An unsigned NSIS installer (`paperl10n-0.1.0-setup.exe`) with Start-menu and desktop shortcuts,
built and tested in CI on `windows-latest`: it installs silently, the app starts from its install
folder, and it uninstalls. Without signing, Windows shows "Windows protected your PC" until the
user chooses "Run anyway"; the install notes say how.

When it's offered (**question**):

| Option | Notes |
|---|---|
| **A. Built and tested from M6 on, offered in releases as an early beta** (recommended) | What Plot Device did for 0.3.0. The release isn't marked "Pre-release" (update notices skip those); the notes call it an early beta. |
| B. Built and tested, but not attached to releases until a Windows beta | Nobody on Windows can try it yet. |

### 5. macOS

Not built in M6. Noted in the README as planned. Building it later needs a Mac runner (CI has
them) and, to open without Gatekeeper's warning, an Apple Developer account for signing and
notarization: part of the later signing decision.

### 6. Update notices

As in Plot Device (its Milestone 15), with Paper Lion's addresses:

- **`latest.json`**, attached to every release: `format`, `version`, `date`, `notes` (the
  release's page), and `download` (where to get it; the release page, until there's an install
  page). Checked against a schema; anything unexpected is ignored, never shown.
- **The address** is `releases/latest/download/latest.json`: GitHub sends it to the newest
  **published** release, so the file goes live the moment a release is published, and never
  before (a draft is invisible to it). Releases mustn't be marked "Pre-release".
- **When:** at most once a day, after startup, in main. A failed check is silent and tried again
  later. Off in development and in tests (tests use a local server through a test-only setting the
  packaged app ignores).
- **What the user sees:** a quiet "Update available" in the header when a newer version is out,
  opening a small panel: "Paper Lion 0.2.0 is out.", **What's new**, **Download**, and **Not now**
  (stops mentioning that version, across restarts). **Check for updates** in the About window
  answers "You have the newest version", the newer version, or "Couldn't check for updates".
  A setting turns the daily check off.
- **Privacy:** a plain request with nothing about the user: no identifier, no version in the
  address, no cookies. Redirects are followed by hand and only to GitHub's hosts; a size limit and
  a timeout. The setting's description says what's sent.
- **Where it lives** (**question**): checking for updates isn't translation work, so it doesn't
  belong in the existing domains. AGENTS.md asks for an ADR before a new domain.

  | Option | Notes |
  |---|---|
  | **A. A small `updates` domain, with an ADR** (recommended) | `domain/`: comparing versions, "newer and not dismissed", once a day. `application/`: the check use case and an `UpdateSource` port. `adapters/`: the GitHub fetch (main only). Testable like the rest, with in-memory fakes. |
  | B. In `app/node/` only | Less ceremony, but the rules (once a day, dismissing, a clock set backwards) would be untested outside an end-to-end run. |

### 7. The About window

Paper Lion has none yet. It shows the version, the licence (GPL-3.0-or-later, with "your
translations are yours"), the open-source components the app includes and their licences
(generated at build time with `pnpm licenses list`, so it's never out of date; GPL compliance),
and **Check for updates**. In English and Hebrew. Reached from the header's menu.

### 8. Releasing

As in Plot Device, scaled down:

- **Every push:** CI builds the Linux packages (and the Windows installer) and keeps them as
  build artifacts for a while, so any commit can be tried.
- **A tag `v0.1.0`:** a workflow builds everything, then creates a **draft** GitHub release with
  the AppImage, the `.deb`, the Windows installer, a `SHA256SUMS` file, `latest.json`, and the
  release notes. Nothing is public until you download the draft's files, try them, and click
  **Publish**; that moment is also when update notices start.
- **Release notes** (**question**):

  | Option | Notes |
  |---|---|
  | **A. A `CHANGELOG.md` written by hand per release**, checked by CI (the tagged version has a section, with no placeholder left) (recommended for now) | This repository's commit subjects (`ui: …`, `formats: …`) are written for developers, so generating notes from them would read poorly for translators. |
  | B. Generated from commits, as Plot Device does (`pnpm release <version>` opens a pull request with the notes to edit) | Less to write, but needs commit prefixes like `feat:`/`fix:` from now on. |

### 9. Opening a project from the file manager

Plot Device registers "Open with" for folders and opens a folder passed on the command line (in
the running app, if there is one). **Recommendation:** later, not in M6: Paper Lion opens one
project at a time through its own picker today, and a single-instance hand-off is its own piece
of work.

## Tests

- **The packaged app**, end to end (Playwright against the packaged app, Linux and Windows in
  CI): it starts under its own name and version, the sandbox and the security policy hold inside
  the packaged app (asar), settings go to the `paperl10n` folder, and a sample project opens and
  saves a translation. The UI harness is never in it (the existing build check).
- **Packages:** the `.deb` installs and removes cleanly (`dpkg -i`, `dpkg -r`), with its desktop
  entry and AppStream metadata valid (`desktop-file-validate`, `appstreamcli validate`); the
  AppImage starts (with the restriction lifted) and its launcher's message shows when the
  restriction is on; the Windows installer installs silently, starts, and uninstalls.
- **Update notices:** the version rules table-driven (newer, same, older, dismissed, once a day,
  a clock set backwards); the fetch against a local server (redirects to other hosts refused, too
  big, too slow, malformed, an unknown `format`); end to end: the notice, "Not now" across a
  restart, the setting, and About's check.
- **Releasing:** the workflows' dry run on a throwaway tag (then deleted), checking the attached
  files and that `latest.json` is valid.

## Proposed steps (after the decisions)

- **I1, packaging:** electron-builder, the release identity, icons, the desktop entry and AppStream
  metadata, the AppImage launcher's message; the packaged smoke test on Linux; what the `.deb`
  does for the sandbox, verified.
- **I2, the About window and the licence list.**
- **I3, update notices:** the ADR and the `updates` domain, the fetch in main, the IPC methods,
  the header notice, About's check, and the setting.
- **I4, CI and releasing:** builds on every push (Linux and Windows), install and uninstall
  tests, the packaged end-to-end tests on both, draft releases on tags with `SHA256SUMS` and
  `latest.json`, the changelog check; the dry run.
- **I5, docs and the PRD:** an install section in the README (Linux and its two formats, Windows'
  warning, macOS planned), releasing in the development docs, and the PRD (its own PR, for
  approval). Then tagging `v0.1.0` is yours.

## Open questions for the maintainer

- The questions marked above: Windows in releases (4), where update checking lives (6), and
  release notes (8).
- Whether the first release should wait for anything else in the product (the PRD's milestones
  are all done).
