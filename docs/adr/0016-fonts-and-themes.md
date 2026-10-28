# 0016. Fonts, themes, icons, and interface preferences

- Status: accepted
- Date: 2026-10-28

## Context

The UI/UX design work after M0 starts from the mockups chosen in review ([UI-UX](../plan/UI-UX.md),
directions A and C). They use specific typefaces for mixed Latin and Hebrew text, a light and a
dark palette, and a few icons. The renderer's CSP allows only the app's own files (`font-src
'self'`), so nothing can load from a font or icon CDN. The UI must mirror in right-to-left
layouts, and Paper Lion is a desktop app: the interface's own settings live with the user, not
in projects.

## Decision

- **Fonts are bundled from Fontsource** (all OFL-1.1), imported once in `src/ui/styles/fonts.css`:
  - Interface: **IBM Plex Sans** with **IBM Plex Sans Hebrew** (one design, so mixed lines match).
  - Content: **Source Serif 4** with **Frank Ruhl Libre**. Hebrew content (`:lang(he)`) leads with
    Frank Ruhl, so Latin words inside Hebrew text match it.
  - Code and paths: **IBM Plex Mono**.
  - Static families import only the subsets and weights in use (Latin, Latin Extended, Hebrew;
    400–600). The variable families ship their whole stylesheet; `unicode-range` makes the
    browser fetch only the subsets a page needs. The renderer build is about 1.1 MB.
  - Each `--pl-font-*` token falls back to platform fonts, so text never goes missing.
- **Themes: system, light, or dark.** The choice is a radio group in the header (`ThemeSwitch`),
  applied as `<html data-theme>`, which `tokens.css` already reads. "System" removes the
  attribute, so `prefers-color-scheme` decides.
- **Interface preferences** (theme, interface language) are per-user conveniences, stored in the
  renderer's `localStorage` behind a small `PreferenceStore` (`src/ui/preferences.ts`) that
  tolerates missing or refused storage. Without a saved language, the UI picks the first of the
  system's languages it supports, then English. Project settings never go here.
- **Icons are hand-written** 24×24 stroke SVGs (`src/ui/components/icons.ts`), rendered by
  `AppIcon`. Each declares `mirrorsInRtl`: an icon that points somewhere (forward) flips in RTL;
  one that depicts a thing (sun, folder) never does. A set (for example Lucide) can replace them
  if the count grows.
- **The mark is used unmodified** (it's CC BY-ND, `assets/README.md`). Its navy outline vanishes
  on dark surfaces, so dark themes show it on a light disc (`--pl-mark-backing`). `assets/` is a
  lint element, and only the UI may import from it (`#assets/<file>`).
- **Profiles:** main honors Chromium's `--user-data-dir`. Each end-to-end test runs in a fresh
  temporary profile, so tests never touch a developer's real app profile.

## Alternatives considered

- **System fonts only:** no dependencies, but Hebrew and Latin metrics vary by OS, and the design
  would look different everywhere.
- **Remote fonts (Google Fonts):** forbidden by the CSP, and an offline desktop app shouldn't need
  the network to render its own UI.
- **An icon dependency now:** hundreds of icons for the six we use. RTL mirroring would still need
  our own list.
- **Preferences in a main-process settings file:** needs an IPC method and a port for something
  the renderer can keep itself. Revisit when settings must be shared with main (for example the
  native menu's language).
- **A recolored dark variant of the mark:** a derivative of a CC BY-ND work, so it's the
  maintainer's call. The backing disc avoids it for now.

## Consequences

- OFL requires the license and copyright notices to travel with the fonts. The Fontsource packages
  carry them, but **packaging must include them in the app** (an "Open source licenses" screen or
  file). Tracked for the packaging milestone.
- New UI strings come in sets of three files (`en`, `he`, `qqq`), as before.
- With a shared profile, each e2e test waited about 4 s on the storage lock whenever a dev
  instance was running (found while adding preferences). Separate profiles fixed that, and keep
  test data out of the real profile.
