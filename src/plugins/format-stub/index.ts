// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin's only entry point. Only src/app/ imports it, as `#plugins/format-stub`.
import type { PluginModule } from '#plugin-api';
import { formatStub } from './format-stub.ts';
import manifest from './paperl10n-plugin.json' with { type: 'json' };

export const plugin: PluginModule = { manifest, create: () => formatStub };
