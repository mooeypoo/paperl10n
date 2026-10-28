// SPDX-License-Identifier: GPL-3.0-or-later
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectFiles } from './project-files.ts';

/** What a plugin gets when it opens a project. */
export interface FormatContext {
  readonly files: ProjectFiles;
  readonly sourceLocale: LocaleId;
  /** This plugin's section of `paperl10n.config.json`, unvalidated. The plugin validates it
   * and returns `formats.invalid-options` when it's wrong. */
  readonly options: Readonly<Record<string, unknown>>;
}
