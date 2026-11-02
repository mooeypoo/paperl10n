// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  FormatError,
  GuardedCatalogLayout,
  RegisteredCatalogFormat,
  SourceCatalog,
} from '#domains/formats';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';

export interface FoundCatalog {
  readonly catalog: SourceCatalog;
  readonly format: RegisteredCatalogFormat;
  readonly layout: GuardedCatalogLayout;
}

export type FindCatalogError =
  { readonly code: 'workspace.unknown-catalog'; readonly key: string } | FormatError;

/** A catalog of the project by key, with its format and layout. A project without catalogs has
 * none: every key is unknown. */
export async function findCatalog(
  project: OpenedProject,
  key: string,
): Promise<Result<FoundCatalog, FindCatalogError>> {
  if (project.catalogs === null) return err({ code: 'workspace.unknown-catalog', key });
  const { format, layout } = project.catalogs;
  const catalogs = await layout.listCatalogs();
  if (!catalogs.ok) return catalogs;
  const catalog = catalogs.value.find((candidate) => candidate.key === key);
  return catalog === undefined
    ? err({ code: 'workspace.unknown-catalog', key })
    : ok({ catalog, format, layout });
}
