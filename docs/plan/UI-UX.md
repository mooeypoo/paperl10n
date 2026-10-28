# After M0: UI and UX design discussion

Status: **first pass done (U1, U2).** M0 delivered the decoupled UI (the gate below passed). The
foundation and direction A's shell are built with the data that exists today; the editor and
section view follow when M1/M2 provide content, sections, and status.

## First pass

Decided with the maintainer (2026-10-28): fonts bundled from Fontsource, hand-written SVG icons,
and this scope: foundation + app shell, with no mock data and no controls that don't work yet.

| Step | What | Status |
|---|---|---|
| U1 | Foundation: the mockups' fonts, a system/light/dark theme switch, icons that know whether they mirror in RTL, the mark in the header, saved interface preferences ([ADR 0016](../adr/0016-fonts-and-themes.md)) | done |
| U2 | Direction A's shell: header (mark, project chip, language pair, theme, interface language), a Pages sidebar with search, the selected document's header and its source/translation panes | done |
| later | The section view, full page, status and progress, hints, editing (CodeMirror spike first), and the catalog view (C) | with M1–M4 |

U1 done-notes:
- Fonts: IBM Plex Sans + Plex Sans Hebrew (interface), Source Serif 4 + Frank Ruhl Libre
  (content; Hebrew leads with Frank Ruhl), IBM Plex Mono. Verified in Chromium: all five load,
  with no CSP or console errors, in the harness and (by the e2e suite) in the built app.
- `ThemeSwitch` is a radio group (arrow keys, announced choice); `<html data-theme>` applies it.
  Preferences live in `localStorage` behind a `PreferenceStore` that tolerates blocked storage.
  The interface language defaults to the first supported system language.
- The mark is unmodified; dark themes show it on a light disc. `assets/` became a lint element
  only the UI may import (sample, control, and mutation check).
- Found on the way: the e2e tests shared the developer's real profile. Main now honors
  `--user-data-dir`, each test gets a temporary profile, and a test asserts it (mutation-checked).
- Open for the maintainer: a real dark-surface variant of the mark (the disc is a stopgap), and
  whether the content serif pairing reads well at length once real documents render.

U2 done-notes:
- Components: `AppHeader`, `PagesSidebar`, `DocumentView` + `DocumentPane`, `WelcomeState`.
  Logic stays in composables: `usePages` (search by every word of key or path, selection, reset
  when another project opens) and `autonym` (each language by its own name, via
  `Intl.DisplayNames`; the interface-language menu uses it too).
- Only working controls. "Open folder…" sits in the welcome card until a project is open, then
  in the header. The panes show each file's path and one plain note that content comes later;
  there's no mock content, status, or progress.
- **Bidi:** a pane's heading is interface text, so it takes the interface's `lang`/`dir`, not the
  pane's, and the pane is labelled by it (`aria-labelledby`). Before the fix, the English
  interface showed "translation · עברית" over the Hebrew pane. A test covers it
  (mutation-checked).
- The language pair reads source → target in both directions: the arrow mirrors in RTL, and a
  visually hidden sentence ("Translating from English into עברית") is what screen readers hear.
- Verified in Chromium (harness, light and dark, English and Hebrew) and by the e2e suite on the
  built app.

## Decisions so far

- **Mockups:** [Paper Lion UI directions](https://claude.ai/artifact/Vv9QBjG4RTofxSSViU8wB4)
  (private to the maintainer; a design canvas with interactive artboards).
- **A "Manuscript" for longform.** The default is the **section view**: sections are paired at
  headings, headings on their own row, with per-section status and progress ("2 of 4 sections up to
  date"). **Full page** is the secondary view, with loose scroll sync. Source changes are
  highlighted on the source side, and hints (code blocks, links, images, length) are neutral chips.
- **C "Catalog" for banana-i18n.** Keyed rows with exact status (missing, outdated, placeholder
  issue, not in source), placeholder chips, a plural preview, and the `qqq` documentation shown
  **prominently when a row is expanded** (small when collapsed).
- **B "Studio" is set aside**, at most a raw-file editor inside A later. Its per-line "missing"
  markers are wrong for longform.
- **Palette:** A's, seeded by the mark; it's already the app's design tokens (M0 step 13).
- **Visual (rendered) editing** of sections and full pages, with bidi-safe link insertion, is a
  planned requirement (see below, and PRD §7.2/§11).

## Goals (from the maintainer)

- A **beautiful UI**, with light and dark themes.
- A **clear experience for writing Markdown**, probably with **CodeMirror** as the editor.
- **Helpers for banana-i18n** messages: placeholders, `{{PLURAL:…}}`, `{{GENDER:…}}`, and links.
- The **most understandable UX**: menus, buttons, and flows that explain themselves.

## The gate: is the UI decoupled?

The redesign should touch `src/ui/` only. M0 is meant to guarantee that. Before brainstorming,
check:

- [x] `src/ui/` imports only `#ipc-contract` (plain DTOs), the kernel, Vue, and the i18n library.
      Lint enforces it, and architecture samples prove a UI file importing a domain fails.
- [x] All UI state comes from composables over an **injected client**. Components get no data
      from anywhere else (ADR 0008, step 14).
- [x] UI tests run against a **fake client**, with no Electron and no main process.
- [x] Styling is **tokens only** (CSS custom properties), with logical properties, enforced by
      stylelint (step 13). Swapping the look means swapping tokens and components, not untangling
      hard-coded values.
- [x] Every string comes from the message files (`en.json` / `qqq.json`), so a new design can
      relabel anything without touching logic.
- [x] A **browser UI harness** (`pnpm dev:harness`, M0 step 14, ADR 0015). It runs `src/ui/` in a normal
      browser on the *real* app wiring (use cases, registry, plugins) over in-memory fixture
      projects. It's a development and testing aid: the strongest proof of decoupling, and the
      fastest loop for design experiments. **Paper Lion stays a desktop app**: the harness is
      never shipped and is no web target.

## Inputs we already have

- **The mark:** [`assets/paperl10n-mark.svg`](../../assets/paperl10n-mark.svg), a lion with a
  paper mane and a folded corner; palette in [`assets/README.md`](../../assets/README.md).
  Questions for the design work:
  - **Dark theme:** the navy ink outline (`#14213D`) disappears on dark backgrounds. A dark-surface
    variant (lighter ink, or a subtle backing shape) is probably needed.
  - **Small sizes:** brows, eye highlights, and thin strokes won't survive 16–32 px (window icon,
    taskbar, favicon). A simplified small-size variant is likely needed.
  - **App icon:** each platform needs its own format (`.icns`, `.ico`, PNG sizes), so it's done
    together with packaging.
  - **Palette:** the warm amber and cream with deep navy could seed the token palette, checked
    for contrast in both themes.

## Topics to brainstorm

### Visual design

- Theme model: light, dark, and "follow the system", with an explicit toggle. Token architecture
  (base palette → semantic tokens → component tokens).
- Typography for **mixed scripts**: a type pairing that covers Latin, Hebrew, and Arabic well,
  with matching weights and metrics. Monospace for raw Markdown in each script.
- Density, spacing scale, and focus states. Motion: minimal, and respecting
  `prefers-reduced-motion`.
- Icons: a set that mirrors correctly in RTL (arrows, "next", "back"), and one that doesn't
  mirror what shouldn't (checkmarks, media controls).

### The writing experience (longform)

- CodeMirror 6 looks like a strong fit for the editor requirements (plan §8.2): per-line text
  direction, bidi isolation of Markdown syntax, IME support, decorations (for source-change
  highlights and preservation hints), a viewport-based renderer, a CSP nonce, and framework independence. To be
  confirmed by a spike, not assumed.
- Source pane vs. target pane: read-only styling, loose heading-anchored scroll sync, and how
  source changes and preservation hints are shown. **Longform is paired by section, not by line**
  (PRD §7.2): the default section view pairs sections at headings, with per-section status and
  progress; a full-page view is the secondary mode. Never mark a paragraph or line of a
  translation as "missing". Exact per-item status belongs to catalogs (direction C).
- Raw ↔ preview toggle; how frontmatter fields are edited; placeholders for custom components.

### Visual (rendered) editing

- Translators shouldn't have to write Markdown by hand, and especially not links. Editing a
  section (or the full page) as formatted text, with controls for links, emphasis, and code, is a
  planned requirement (PRD §7.2).
- **The RTL reason:** a raw `[text](url)` in the middle of a Hebrew sentence can reorder the
  sentence visually, through the bidi algorithm. The editor must keep link targets and inline
  syntax isolated from the surrounding text.
- Open choice (PRD §11): decorations over Markdown source (CodeMirror live preview) or a rich-text
  editor that serializes to Markdown. Round-trip safety decides it as much as UX does.

### Banana-i18n helpers (catalogs, M4)

- Syntax highlighting for `$1`, `{{PLURAL:$1|…}}`, `{{GENDER:…}}`, and `[[links]]`.
- Inline warnings when placeholders differ between source and target.
- Previews of plural and gender forms, rendered with banana-i18n itself.
- Autocomplete for placeholders that are present in the source.
- `qqq` documentation shown next to the message.

### Menus, buttons, and flows

- Native application menu (Electron, localized) vs. in-app menus vs. a command palette, and
  which actions live where. Keyboard shortcuts.
- Main flows: open a project → choose locales (M1 picker) → see what needs work → edit → save.
- Empty, loading, and error states. Every error code already has a message key.
- RTL: the whole chrome mirrors when the UI language is RTL. Panes follow their own locale.

### Accessibility

- Keyboard-only use, screen-reader labels (already i18n-ready), contrast in both themes, and a
  WCAG 2.1 AA audit.

## The UI harness: what it proves, and what it doesn't

Accepted in review round 4 as a testing aid, built in M0 step 14, after the Electron UI.
Electron comes first: the harness exists to make UI iteration and UI tests cheaper, not to
steer the app toward the web.

- **Real:** the UI, the use cases, the format registry, the plugins, and the error-to-message
  mapping. It's the same `createAppApi` the Electron app uses.
- **Substituted, and proven:** the filesystem (in-memory fixture projects; the in-memory
  `ProjectFiles` passes the same contract suite as the disk adapter), the transport (direct calls
  that `structuredClone` every result, as IPC does), and the folder dialog.
- **Not covered, so not evidence:** the preload, Electron's renderer sandbox, CSP, IPC sender and argument
  validation, real disk behavior (symlinks, permissions), and native menus. The Electron
  end-to-end test in CI is the authority for those.
- **Development only:** never part of the app bundle, and no web-only features (routing,
  offline support, mobile layouts) get built for it.
- **Playwright on Electron is the authority** for end-to-end behavior. If browser-harness
  Playwright tests are added for cheap UI-flow coverage, they supplement it, never replace it.

Also in M0 (step 13): tokens get a light and a dark set, chosen by `prefers-color-scheme` with a
`data-theme` override, so theme switching is designed in from the start. The M0 visual design
itself stays deliberately minimal, so the real design work starts from a clean slate.
