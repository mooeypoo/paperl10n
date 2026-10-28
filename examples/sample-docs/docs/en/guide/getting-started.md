---
title: Getting started
---

# Getting started

This guide takes you from an empty folder to a running site. You need
[Node.js](https://nodejs.org/) 24 or later.

## Install Lantern

Create a folder for your site and install Lantern in it:

```sh
mkdir my-site && cd my-site
npm install --save-dev lantern
```

<Badge type="tip" text="New in 2.0" /> Lantern now creates a starter `docs/` folder for you.

## Create your first page

Lantern reads pages from `docs/`. Create `docs/index.md`:

```md
# Hello

This is my first Lantern page.
```

## Start the dev server

Run `npx lantern dev` and open <http://localhost:4173>. The page reloads every time you save a
file.

## Next steps

1. Add more pages to `docs/`. Each file becomes a page.
2. Set a title and a logo in the [configuration](./configuration.md).
3. When you're ready, run `npx lantern build` and upload the `dist/` folder anywhere.

::: tip
Stuck? Check the [CLI reference](../reference/cli.md) for every command and flag.
:::
