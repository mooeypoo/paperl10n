// SPDX-License-Identifier: GPL-3.0-or-later
// The built-in plugins: the only place in the app that names them (AGENTS.md, "Formats are plugins").
import type { PluginModule } from '#domains/formats';
import { plugin as formatStarlight } from '#plugins/format-starlight';
import { plugin as formatStub } from '#plugins/format-stub';

export const builtInPlugins: readonly PluginModule[] = [formatStarlight, formatStub];
