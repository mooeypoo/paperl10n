// SPDX-License-Identifier: GPL-3.0-or-later
import { pairCatalog, type Message, type PlaceholderToken } from '#domains/catalog';
import type { FormatError, RegisteredCatalogFormat, SourceCatalog } from '#domains/formats';
import { emptyStatusFile, messageStatus, type MessageStatus } from '#domains/translation';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { readCatalogFile, type CatalogReadError } from './catalog-files.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';
import { readStatusFile, type StatusReadError } from './translation-status.ts';

/** A source message as the message list shows it. */
export interface CatalogMessageEntry {
  readonly key: string;
  readonly source: string;
  /** What the documentation says about it; `null`: nothing. */
  readonly documentation: string | null;
  /** `null`: not translated (or translated empty). */
  readonly translation: string | null;
  readonly status: MessageStatus;
  /** What the source's text must keep, as the plugin's scanner finds it. */
  readonly sourceTokens: readonly PlaceholderToken[];
  readonly translationTokens: readonly PlaceholderToken[];
}

/** A message the translation has and the source no longer does. */
export interface NotInSourceEntry {
  readonly key: string;
  readonly text: string;
  readonly tokens: readonly PlaceholderToken[];
}

export interface ReadCatalogResult {
  readonly key: string;
  readonly sourcePath: ProjectPath;
  readonly targetPath: ProjectPath;
  readonly targetExists: boolean;
  /** The documentation file, when the catalog has one. */
  readonly documentationPath: ProjectPath | null;
  /** In source order. */
  readonly messages: readonly CatalogMessageEntry[];
  /** In the translation's order. */
  readonly notInSource: readonly NotInSourceEntry[];
  /** Why the documentation can't be read: the messages then show none, and still translate. */
  readonly documentationProblem: CatalogReadError | null;
  /** The target language's status file, as for pages. */
  readonly statusFile: { readonly exists: boolean; readonly problem: StatusReadError | null };
}

export type ReadCatalogError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-catalog'; readonly key: string }
  | CatalogReadError
  | FormatError;

export type ReadCatalog = (
  projectId: string,
  key: string,
) => Promise<Result<ReadCatalogResult, ReadCatalogError>>;

/** The tokens the format finds; none when its scanner fails (they help, and aren't worth an error). */
function scan(format: RegisteredCatalogFormat, text: string): readonly PlaceholderToken[] {
  const tokens = format.scanPlaceholders(text);
  return tokens.ok ? tokens.value : [];
}

/**
 * A catalog for the target language: each source message with its documentation, translation,
 * status, and tokens, and the translation's messages the source no longer has. The source and
 * target files must read; the documentation may not (it's help, not the work).
 */
export function createReadCatalog(deps: { readonly sessions: ProjectSessions }): ReadCatalog {
  return async (projectId, key) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const target = project.targetLocale;
    if (target === null) return err({ code: 'workspace.no-target-locale' });
    if (project.catalogs === null) return err({ code: 'workspace.unknown-catalog', key });
    const { format, layout } = project.catalogs;

    const catalogs = await layout.listCatalogs();
    if (!catalogs.ok) return catalogs;
    const catalog: SourceCatalog | undefined = catalogs.value.find((c) => c.key === key);
    if (catalog === undefined) return err({ code: 'workspace.unknown-catalog', key });
    const targetPath = layout.targetPathFor(catalog, target.id);
    if (!targetPath.ok) return targetPath;

    const source = await readCatalogFile(project, format, catalog.path);
    if (!source.ok) return source;
    const translation = await readCatalogFile(project, format, targetPath.value);
    if (!translation.ok) return translation;
    let documentation: readonly Message[] | null = null;
    let documentationProblem: CatalogReadError | null = null;
    if (catalog.documentation !== undefined) {
      const read = await readCatalogFile(project, format, catalog.documentation);
      if (read.ok) documentation = read.value;
      else documentationProblem = read.error;
    }

    const status = await readStatusFile(project, target.id);
    const record = (status.ok ? status.value.file : emptyStatusFile).catalogs.get(catalog.key);
    const paired = pairCatalog(source.value ?? [], translation.value, documentation);
    return ok({
      key: catalog.key,
      sourcePath: catalog.path,
      targetPath: targetPath.value,
      targetExists: translation.value !== null,
      documentationPath: catalog.documentation ?? null,
      messages: paired.messages.map((message) => ({
        key: message.key,
        source: message.source,
        documentation: message.documentation,
        translation: message.translation,
        status: messageStatus(message.source, message.translation, record?.get(message.key)),
        sourceTokens: scan(format, message.source),
        translationTokens: message.translation === null ? [] : scan(format, message.translation),
      })),
      notInSource: paired.notInSource.map((message) => ({
        key: message.key,
        text: message.text,
        tokens: scan(format, message.text),
      })),
      documentationProblem,
      statusFile: {
        exists: status.ok && status.value.exists,
        problem: status.ok ? null : status.error,
      },
    });
  };
}
