// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a catalog's files through its format plugin.
import type { Message } from '#domains/catalog';
import type { FileAccessError, FormatError, RegisteredCatalogFormat } from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';

export type CatalogReadError =
  | { readonly code: 'workspace.catalog-unreadable'; readonly cause: FileAccessError }
  /** The plugin can't read the file as its format (`formats.invalid-catalog`), or failed. */
  | FormatError;

/** A catalog file's messages; `null` when the file doesn't exist. */
export async function readCatalogFile(
  project: OpenedProject,
  format: RegisteredCatalogFormat,
  path: ProjectPath,
): Promise<Result<readonly Message[] | null, CatalogReadError>> {
  const text = await project.files.readText(path);
  if (!text.ok) {
    return text.error.code === 'files.not-found'
      ? ok(null)
      : err({ code: 'workspace.catalog-unreadable', cause: text.error });
  }
  const parsed = format.parse(text.value);
  return parsed.ok ? ok(parsed.value.messages) : parsed;
}
