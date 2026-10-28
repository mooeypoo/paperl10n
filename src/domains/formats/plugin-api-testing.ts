// SPDX-License-Identifier: GPL-3.0-or-later
// Test support for plugins (`#plugin-api/testing`). Part of the plugin API: if plugins are
// extracted, this becomes `@paperl10n/plugin-api/testing`.
export { InMemoryProjectFiles, type FileTree } from './testing/in-memory-project-files.ts';
export {
  describePluginContract,
  openFixture,
  type PluginContractOptions,
  type PluginFixture,
} from './testing/plugin-contract.ts';
