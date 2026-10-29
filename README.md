# Paper Lion

[![CI](https://github.com/mooeypoo/paperl10n/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mooeypoo/paperl10n/actions/workflows/ci.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

**Localizing your pages.** Paper Lion (`paperl10n`; *l10n* read as "lion") is a local desktop app
for translating a project's content side by side: source on one side, target language on the
other, kept in sync, with first-class right-to-left (RTL) support.

It handles two kinds of translation work:

- **Longform:** Markdown pages of static docs sites (VitePress, Astro Starlight, …).
- **Interface strings:** message catalogs, starting with
  [banana-i18n](https://github.com/wikimedia/banana-i18n) JSON, and gettext later.

Each system is supported through a format plugin, so adding one means adding a plugin, not
rewriting the app.

> **Status: pre-alpha.** Paper Lion opens a project (Astro Starlight sites, or a plain folder per
> locale), lists its pages with which ones have a translation, and shows each page's source and
> translation side by side, read-only. Choosing languages in the app, editing, and saving come
> next.

## Documentation

- [Product requirements](docs/PRD.md): scope, glossary, milestones
- [Agent and contributor rules](AGENTS.md): architecture rules this codebase follows
- [Architecture](docs/architecture.md): how the code is organized, and where new code goes
- [Domains](docs/domains/): the vocabulary and invariants of each domain
- [Architecture decision records](docs/adr/)
- Plans: [M0](docs/plan/M0.md), [UI/UX](docs/plan/UI-UX.md), [M1 reading](docs/plan/M1-reading.md), [M1 languages](docs/plan/M1-languages.md)

## Development

Requirements: Node.js 24 and pnpm. With [nvm](https://github.com/nvm-sh/nvm), `nvm use` picks the
Node version from `.nvmrc`. `corepack enable` then provides the pnpm version pinned in
`package.json`.

```sh
git clone https://github.com/mooeypoo/paperl10n.git
cd paperl10n
nvm use
corepack enable
pnpm install        # also enables the git hooks
pnpm check          # what CI checks: types, lint, formatting, tests
pnpm dev            # run the app with hot reload
```

**Your own Starlight site:** add a `paperl10n.config.json` to its folder and open it:

```json
{ "sourceLocale": "en", "documentFormat": "format-starlight" }
```

Paper Lion then asks which language to translate into, and saves your choice in the same file as
`"targetLocale"` (changing nothing else in it), so everyone working on the site shares it.

See [`format-starlight`'s README](src/plugins/format-starlight/README.md) for folder conventions
and options.

Or, in the app, **Open folder…** and choose `examples/sample-docs`, a small sample docs site with
English sources and partial Hebrew translations (see its README). Edit it freely to try things
out.

More commands:

```sh
pnpm dev:harness    # the UI in a browser over the sample and fixture projects (a testing aid, ADR 0015)
pnpm test:watch     # tests, re-run on change
pnpm test:e2e       # build, then run the Electron end-to-end tests
pnpm build          # production build into out/
pnpm lint:fix       # fix what lint and SPDX headers can fix
```

**On Ubuntu 23.10+**, Electron's sandbox needs a one-time AppArmor profile:
[docs/development/linux-sandbox.md](docs/development/linux-sandbox.md). `pnpm dev` tells you when
it's missing. Never turn the sandbox off instead.

`pnpm dev` removes `ELECTRON_RUN_AS_NODE` from the environment before starting Electron. VS Code
sets it for processes its extensions start, and it would make Electron run as plain Node.

## License

Copyright © 2026 [Moriel](https://moriel.tech).

Paper Lion is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

Paper Lion is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[GNU General Public License](LICENSE) for more details.

The Paper Lion name and mark are **not** covered by the GPL: the mark is licensed CC BY-ND 4.0,
and forks need their own name and logo. See [assets/README.md](assets/README.md).

Created by [Moriel](https://moriel.tech).
