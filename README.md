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

> **Status: pre-alpha.** The architectural skeleton is being built (milestone M0). Nothing is
> usable yet.

## Documentation

- [Product requirements](docs/PRD.md): scope, glossary, milestones
- [Agent and contributor rules](AGENTS.md): architecture rules this codebase follows
- [Architecture decision records](docs/adr/)
- [M0 plan](docs/plan/M0.md)

## Development

Requirements: Node.js 24 (`nvm use` reads `.nvmrc`) and pnpm. Scripts arrive with the M0 skeleton
and will be documented here.

## License

Copyright © 2026 [Moriel](https://moriel.tech).

Paper Lion is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

Paper Lion is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
[GNU General Public License](LICENSE) for more details.

Created by [Moriel](https://moriel.tech).
