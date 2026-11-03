# Packaging

Paper Lion is packaged with [electron-builder](https://www.electron.build/) (M6, as Plot Device
is): an AppImage and a `.deb` for Linux, and an NSIS installer for Windows. The configuration is
[`electron-builder.yml`](../../electron-builder.yml); decisions in
[the M6 plan](../plan/M6-installer.md).

```sh
pnpm package           # build, then the AppImage and the .deb into dist/ (on Linux)
pnpm package:dir       # build, then only the unpacked app (dist/linux-unpacked/), faster
pnpm test:e2e:packaged # end-to-end tests against the unpacked app (after package:dir)
```

`PAPERL10N_PACKAGED=/path/to/paperl10n pnpm test:e2e:packaged` tests an installed copy instead.

## What's in the package

- **`out/`, `package.json`, and `assets/icons/`** (the window icon is read at run time), in
  `app.asar`. Nothing from `node_modules`: electron-vite bundles main, the preload, and the
  renderer whole, and `pnpm build` fails if main or the preload would load a package at run time
  (`scripts/app-build.ts`).
- **`LICENSE`** and **`third-party-licenses.json`**, beside it in `resources/`, for the About
  window; and Electron's and Chromium's licences, which electron-builder adds. The list of
  open-source components is written by every `pnpm build` into `build/` (not committed), from
  `pnpm licenses list --prod`, Electron's version, and the sources of the language data and the
  gettext plural formulas (`scripts/write-third-party-licenses.ts`), so it's never out of date.
  Running from the repository, About reads `LICENSE` and `build/` instead.
- **Icons** for Linux's hicolor theme from `assets/icons/` (each file named by its size,
  `512x512.png`, as electron-builder reads them).
- **AppStream metadata** for the `.deb`:
  [`packaging/io.github.mooeypoo.paperl10n.metainfo.xml`](../../packaging/io.github.mooeypoo.paperl10n.metainfo.xml).

## The release identity

App id `io.github.mooeypoo.paperl10n`, name "Paper Lion", executable and package `paperl10n`.
They must not change once released. Settings and drafts live in a `paperl10n` folder in the OS's
app data; running from the repository (`pnpm dev`, `pnpm preview`) uses `paperl10n-dev`, so trying
a release never mixes with a development profile.

## Linux and the sandbox

- **The `.deb`** installs the app in `/opt/Paper Lion/`, and its install script puts an AppArmor
  profile for it in `/etc/apparmor.d/paperl10n` (allowing user namespaces, on Ubuntu 24+), or,
  where there are no user namespaces, makes `chrome-sandbox` setuid. Either way the sandbox stays
  on ([linux-sandbox.md](linux-sandbox.md) says why it matters).
- **The AppImage** must be made executable once after downloading (`chmod +x`, or Files →
  Properties → "Executable as Program"). On each start it keeps its own desktop entry and icon
  under `$XDG_DATA_HOME` (or `~/.local/share`), so GNOME shows its icon and it's in the
  applications menu (`src/main/appimage-desktop.ts`, as Plot Device does).
- **Testing the unpacked app** on a machine that restricts the sandbox: the packaged tests start
  it with `--no-sandbox` there and skip the sandbox check; CI lifts the restriction, so the
  sandbox is checked there.
