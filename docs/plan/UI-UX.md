# After M0: UI and UX design discussion

Status: **discussion seed, not a plan.** We brainstorm and experiment with this after M0 is done,
and **only if M0 delivers a properly decoupled UI** (the gate below).

## Goals (from the maintainer)

- A **beautiful UI**, with light and dark themes.
- A **clear experience for writing Markdown**, probably with **CodeMirror** as the editor.
- **Helpers for banana-i18n** messages: placeholders, `{{PLURAL:…}}`, `{{GENDER:…}}`, and links.
- The **most understandable UX**: menus, buttons, and flows that explain themselves.

## The gate: is the UI decoupled?

The redesign should touch `src/ui/` only. M0 is meant to guarantee that. Before brainstorming,
check:

- [ ] `src/ui/` imports only `#ipc-contract` (plain DTOs), the kernel, Vue, and the i18n library.
      Lint enforces it, and architecture samples prove a UI file importing a domain fails.
- [ ] All UI state comes from composables over an **injected client**. Components get no data
      from anywhere else (ADR 0008, step 14).
- [ ] UI tests run against a **fake client**, with no Electron and no main process.
- [ ] Styling is **tokens only** (CSS custom properties), with logical properties, enforced by
      stylelint (step 13). Swapping the look means swapping tokens and components, not untangling
      hard-coded values.
- [ ] Every string comes from the message files (`en.json` / `qqq.json`), so a new design can
      relabel anything without touching logic.
- [ ] A **browser UI harness** (`pnpm dev:harness`, M0 step 14). It runs `src/ui/` in a normal
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
  direction, bidi isolation of Markdown syntax, IME support, decorations (for block alignment and
  misalignment hints), a viewport-based renderer, a CSP nonce, and framework independence. To be
  confirmed by a spike, not assumed.
- Source pane vs. target pane: read-only styling, synced scrolling, and how alignment is shown.
- Raw ↔ preview toggle; how frontmatter fields are edited; placeholders for custom components.

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
