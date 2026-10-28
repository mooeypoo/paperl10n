# Brand assets

| File | What it is |
|---|---|
| `paperl10n-mark.svg` | The Paper Lion mark: a lion whose mane is a sheet of paper with a folded corner. 512×512 viewBox, with an accessible `<title>`. |

Palette used in the mark (a starting point for the design tokens, see `docs/plan/UI-UX.md`):

| Role in the mark | Color |
|---|---|
| Ink (outlines, eyes, nose) | `#14213D` |
| Mane (paper) | `#FDF6E7` |
| Folded corner | `#F7E6C4` |
| Head and ears | `#F9B233` |
| Inner ears | `#D9891C` |
| Muzzle | `#FDEBD2` |

The app UI won't load these files from here directly: the UI work (after M0) decides how the
mark is bundled (app icon, about screen, empty states) and which variants it needs.
