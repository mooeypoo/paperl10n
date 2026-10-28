// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileAccessError } from './project-files.ts';
import type { FormatId } from '../../domain/format-id.ts';

/** An expected failure a plugin reports. The registry adds the plugin's id (see `FormatError`). */
export type PluginError =
  | { readonly code: 'formats.invalid-options'; readonly reason: string }
  | { readonly code: 'formats.unsupported-project'; readonly reason: string }
  | { readonly code: 'formats.file-access'; readonly cause: FileAccessError };

/** A plugin failure as the rest of the app sees it: which plugin, and what went wrong. */
export type FormatError = (
  | PluginError
  /** The plugin threw or rejected instead of returning a result: a bug in the plugin. */
  | { readonly code: 'formats.plugin-failed'; readonly reason: string }
) & { readonly formatId: FormatId };
