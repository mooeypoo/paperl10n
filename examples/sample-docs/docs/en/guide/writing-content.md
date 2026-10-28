---
title: Writing content
---

# Writing content

Pages are standard Markdown with a few additions. If you've written a README, you already know
most of it.

## Text and links

Use *emphasis* and **strong emphasis** sparingly. Link to other pages with relative paths, like
[the configuration guide](./configuration.md), so links keep working wherever the site is
hosted. External links such as [the Markdown guide](https://www.markdownguide.org/) open in the
same tab.

## Images

Put images in `docs/public/` and refer to them from the site root:

![The Lantern logo, a lantern with a warm glow](/lantern-logo.svg)

Always write alt text that describes the image. Screen readers read it aloud, and it's shown when
the image can't load.

## Lists

- Steps that must happen in order go in a numbered list.
- Everything else goes in a bulleted list:
  - nested items are indented by two spaces,
  - and keep the same style as their parent.

## Callouts

::: warning
Callouts stand out, so use at most one or two per page.
:::
