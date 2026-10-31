// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin's only entry point. Only src/app/ imports it, as `#plugins/catalog-banana`.
import type { PluginModule } from '#plugin-api';
import { catalogBanana } from './catalog-banana.ts';
import manifest from './paperl10n-plugin.json' with { type: 'json' };

export const plugin: PluginModule = { manifest, create: () => catalogBanana };
