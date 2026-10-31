# Follow-ups

Work that was decided or found along the way but deliberately left for later. Each item says where
it came from. When one is picked up, it moves into that milestone's plan and is removed here.

## From M1: languages ([plan](M1-languages.md))

- **Choose the source language in the app.** Round 2 decided that both sides of the header's
  language pair open the picker. Only the target does now. Changing the source changes which files
  are sources (and which folder the plugin lists), so it needs its own use case: re-open the
  layout with the new source, save `sourceLocale`, refuse a source equal to the target.
- **Name an unknown code from the picker.** Round 2 decided that a code Paper Lion doesn't know is
  allowed: shown with an "unknown language" note, and the user gives it a name and direction,
  saved under `languages` in `paperl10n.config.json`. Now the no-match message explains how to add
  it by hand. Needs: a `languages` entry writer (a nested member, so `setConfigString` grows or
  gets a sibling), a small form in the picker, and choosing the new code right after.
- **An RTL marker on picker rows.** The brainstorm listed one; the row shows the autonym in its own
  direction, which may be enough. Decide with a screen-reader check: does "right to left" need
  saying?
- **Rohingya's default direction.** `rhg` is RTL in the catalog because ULS lists it with the
  Hanifi Rohingya script, though the Rohingya Wikipedia uses Latin. A project can set
  `"languages": { "rhg": { "dir": "ltr" } }`. Open question for the maintainer: change the
  catalog default (an override list in the generator)?
- **A harness fixture without a target language.** The UI harness has no project whose config
  lacks `targetLocale`, so the picker's open-by-itself flow is only seen in unit and e2e tests.

## From M1: reading ([plan](M1-reading.md))

- **Adjacent RTL runs in JSX/HTML blocks can still merge visually.** Those blocks read line by
  line (`dir="auto"` per line in the M2 editor, as `unicode-bidi: plaintext` did in the reading
  view), which fixes most cases, not all.
- **A rendered preview toggle per pane** (PRD §7.2). The panes show Markdown as written, lightly
  styled.

## From M2: editing ([plan](M2-editing.md))

- **Message parameters aren't isolated in older messages.** E3's new messages wrap paths and
  page keys in FSI/PDI (`isolated()` in `ui/i18n/i18n.ts`); error messages and older strings
  don't yet, so a path in a Hebrew sentence can misplace trailing punctuation. Apply it in
  `errorMessage` and the remaining call sites.
- **Manual checks on a real keyboard** (E2b): IME composition, a screen reader (Orca on Linux),
  and how typing and selecting feel at direction boundaries. Not testable offscreen.
- **The parsed blocks and inline spans in `DocumentTextDto` are unused by the UI** since the
  panes became editors (the editor parses in the renderer). Keep them for M3's sections and
  pairing, or drop them from the DTO if M3 doesn't need them in the renderer.
- **Code lines wrap in the editor** (the reading view scrolled them sideways). Decide whether
  long code lines should scroll instead.
- **The renderer bundle isn't minified** (an existing build choice), so CodeMirror and Lezer add
  about 650 KB raw (about 175 KB gzipped) to it. Fine when loading from disk; revisit if startup
  time matters.

## From the UI/UX work ([plan](UI-UX.md))

- **Frontmatter as fields:** keys read-only (always English), values editable, with clear
  direction handling for RTL values. A future brainstorm topic, recorded in UI-UX.md.

## From M3: sections ([plan](M3-sections.md))

- **Section status bars with a screen reader.** The bars (S3d) sit inside the translation
  editor's text box, so a screen reader reads them with its content. Check with NVDA or Orca;
  if it reads badly, move the status out of the text box (an `aria-hidden` bar, with the
  buttons' names carrying the status).
- **Source changes with a screen reader.** The changed and new blocks (S4b) are marked by a tint
  and a line mark only; the page's note, the section bars, and the "Text removed here" markers are
  text. Check what a screen reader gets in the source pane, and whether the marked lines need a
  description too.
- **Changing the split level per document** (PRD §7.2, question 3 of the plan). Not built in S6:
  the default rules held on the plugin fixtures and READMEs. Build it if a page on the
  maintainer's site splits at the wrong level: the level stored in the status file next to the
  page's fingerprints, so it's shared.
- **Keep "Scroll together" across launches.** The full page's toggle (S6) is kept while the app
  runs; a preference (like the theme) would keep it, if turning it off turns out to be common.
