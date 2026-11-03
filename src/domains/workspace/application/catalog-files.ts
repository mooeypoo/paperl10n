// SPDX-License-Identifier: GPL-3.0-or-later
// Reading a catalog's files through its format plugin.
import type { Message, PlaceholderToken } from '#domains/catalog';
import type {
  CatalogFileRole,
  FileAccessError,
  FormatError,
  ParsedCatalog,
  RegisteredCatalogFormat,
} from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';

export type CatalogReadError =
  | { readonly code: 'workspace.catalog-unreadable'; readonly cause: FileAccessError }
  /** The plugin can't read the file as its format (`formats.invalid-catalog`), or failed. */
  | FormatError;

/**
 * A catalog file as its format reads it (its text and messages), as the `role` it has in its
 * catalog; `null` when it doesn't exist.
 */
export async function readParsedCatalog(
  project: OpenedProject,
  format: RegisteredCatalogFormat,
  path: ProjectPath,
  role: CatalogFileRole,
): Promise<Result<ParsedCatalog | null, CatalogReadError>> {
  const text = await project.files.readText(path);
  if (!text.ok) {
    return text.error.code === 'files.not-found'
      ? ok(null)
      : err({ code: 'workspace.catalog-unreadable', cause: text.error });
  }
  return format.parse(text.value, role);
}

/** A catalog file's messages; `null` when the file doesn't exist. */
export async function readCatalogFile(
  project: OpenedProject,
  format: RegisteredCatalogFormat,
  path: ProjectPath,
  role: CatalogFileRole,
): Promise<Result<readonly Message[] | null, CatalogReadError>> {
  const parsed = await readParsedCatalog(project, format, path, role);
  return parsed.ok ? ok(parsed.value?.messages ?? null) : parsed;
}

/**
 * The tokens the format finds in `text`, a text of `message` (as the source has it, when it has
 * it); none when its scanner fails (they help, and aren't worth an error).
 */
export function scanText(
  format: RegisteredCatalogFormat,
  text: string,
  message?: Message,
): readonly PlaceholderToken[] {
  const tokens = format.scanPlaceholders(text, message);
  return tokens.ok ? tokens.value : [];
}
