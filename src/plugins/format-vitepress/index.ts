// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin's only entry point. Only src/app/ imports it, as `#plugins/format-vitepress`.
import type { PluginModule } from '#plugin-api';
import { formatVitepress } from './format-vitepress.ts';
import manifest from './paperl10n-plugin.json' with { type: 'json' };

export const plugin: PluginModule = { manifest, create: () => formatVitepress };
