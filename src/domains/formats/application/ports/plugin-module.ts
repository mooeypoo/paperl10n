// SPDX-License-Identifier: GPL-3.0-or-later
import type { CatalogFormat } from './catalog-format.ts';
import type { DocumentFormat } from './document-format.ts';

export type FormatPlugin = DocumentFormat | CatalogFormat;

/** Services the app gives plugins. Only a version in v1; a logger or clock can be added later
 * without breaking plugins, because plugins receive it through `create`. */
export interface PluginHost {
  readonly apiVersion: 1;
}

/** What a plugin's `index.ts` exports as `plugin`: a manifest (data) and a factory (code). */
export interface PluginModule {
  /** The imported `paperl10n-plugin.json`. Untrusted: the registry validates it. */
  readonly manifest: unknown;
  create(host: PluginHost): FormatPlugin;
}
