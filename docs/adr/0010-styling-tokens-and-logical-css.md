# 0010. Styling: design tokens and logical properties, enforced by stylelint

- Status: accepted
- Date: 2026-10-28

## Context

`AGENTS.md`: styling uses design tokens, with no hard-coded colors or spacing, and logical CSS
only, so layouts mirror in RTL. The visual direction (UI-UX discussion) will keep evolving, so
changing the look should mean changing tokens, not hunting values.

## Decision

- **Tokens** are CSS custom properties in `src/ui/styles/tokens.css` (`--pl-color-…`,
  `--pl-space-…`, `--pl-radius-…`, `--pl-font-…`). The light set is the default; the dark set
  applies with `prefers-color-scheme: dark`, and `<html data-theme="light|dark">` overrides
  either way. The palette comes from direction A ("Manuscript"), seeded by the mark.
- **Fonts are system fonts for now**, with fallbacks for Hebrew and Arabic. The CSP forbids remote
  fonts, and bundling font files is a design-phase decision.
- **stylelint** (core rules, `postcss-html` for `.vue`) enforces:
  - no physical, direction-sensitive properties (`margin-left`, `padding-right`, `left`, …) and
    no `text-align`/`float`/`clear` with `left` or `right`;
  - no raw colors (hex, named, `rgb()`/`hsl()`/…) outside `tokens.css`.
  Messages point to `AGENTS.md`. Samples in `tests/architecture/styles.test.ts` prove each rule
  fires and that logical properties and tokens pass.
- **Vue files** get ESLint's Vue rules without type-aware rules (the project service can't type
  `.vue` files reliably); `vue-tsc` type-checks them. A `*.vue` module declaration lets type-aware
  lint understand `.vue` imports in `.ts` files.

## Alternatives considered

- **A stylelint plugin for logical properties:** extra dependency; core rules cover it.
- **A CSS framework (Tailwind, …):** a large dependency and its own vocabulary, for a UI whose
  design is still open.

## Consequences

- `top`/`bottom` and `margin-block-*` are allowed: the block axis doesn't flip in RTL.
- Raw color values appear in exactly one file, so a theme or design change has one place to start.
