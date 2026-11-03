// SPDX-License-Identifier: GPL-3.0-or-later
// Marking translations up to date (docs/plan/M3-sections.md, question 2): explicit, never a side
// effect of saving. A mark records the source as the translator saw it, in the target language's
// status file, which is written right away.
import type { FileAccessError, FormatError } from '#domains/formats';
import type { DocumentKey, MarkdownParser } from '#domains/document';
import {
  blockFingerprint,
  markSections,
  recordMessages,
  sectionFingerprints,
  serializeStatusFile,
  type CatalogRecord,
  type PageRecord,
} from '#domains/translation';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { readCatalogFile } from './catalog-files.ts';
import type { OpenedProject, ProjectSessions } from './ports/project-sessions.ts';
import type { FileWriteError } from './ports/project-writer.ts';
import {
  documentStatus,
  readStatusFile,
  statusFilePath,
  type DocumentStatus,
  type StatusReadError,
  type StatusUpdates,
} from './translation-status.ts';
import { findDocument } from './find-document.ts';

export interface MarkUpToDateRequest {
  readonly key: string;
  /** The source's fingerprint as the page showed it (`DocumentPair.status.sourceFingerprint`). */
  readonly sourceFingerprint: string;
  /** The source sections to mark, by index in order; `null`: the whole page. */
  readonly sections: readonly number[] | null;
}

export type MarkUpToDateError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-document'; readonly key: string }
  | { readonly code: 'workspace.document-unreadable'; readonly cause: FileAccessError }
  /** The source on disk isn't the one the page showed: reload it before marking. */
  | { readonly code: 'workspace.source-changed'; readonly path: ProjectPath }
  | { readonly code: 'workspace.status-unwritable'; readonly cause: FileWriteError }
  | StatusReadError
  | FormatError;

export type MarkUpToDate = (
  projectId: string,
  request: MarkUpToDateRequest,
) => Promise<Result<DocumentStatus, MarkUpToDateError>>;

/** What marking existing translations marked. */
export interface MarkedExisting {
  /** The pages it marked. */
  readonly marked: readonly DocumentKey[];
  /** How many messages it recorded, over every catalog. */
  readonly markedMessages: number;
}

export type MarkExistingUpToDate = (
  projectId: string,
) => Promise<Result<MarkedExisting, MarkUpToDateError>>;

interface Dependencies {
  readonly sessions: ProjectSessions;
  readonly parser: MarkdownParser;
  readonly updates: StatusUpdates;
}

/** `.mdx` files get MDX tolerance, as when the page is read. */
const parseOptions = (path: ProjectPath) => ({ mdx: path.endsWith('.mdx') });

/**
 * Marks sections of a page (or all of it) up to date with its source, and returns the page's
 * status after. Refused when the source changed on disk since the page showed it, so a version
 * the translator hasn't read is never marked; and when the status file can't be read (it's never
 * overwritten then).
 */
export function createMarkUpToDate(deps: Dependencies): MarkUpToDate {
  return async (projectId, { key, sourceFingerprint, sections }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const locale = project.targetLocale;
    if (locale === null) return err({ code: 'workspace.no-target-locale' });

    const found = await findDocument(project, key);
    if (!found.ok) return found;
    const { document, layout } = found.value;
    const targetPath = layout.targetPathFor(document, locale.id);
    if (!targetPath.ok) return targetPath;

    const path = statusFilePath(locale.id);
    return deps.updates.run(`${project.location}\n${path}`, async () => {
      const text = await project.files.readText(document.path);
      if (!text.ok) return err({ code: 'workspace.document-unreadable', cause: text.error });
      const changed = err({ code: 'workspace.source-changed', path: document.path } as const);
      if (blockFingerprint(text.value) !== sourceFingerprint) return changed;
      const source = deps.parser.parse(text.value, parseOptions(document.path));
      const current = sectionFingerprints(source);
      // The page showed this source, so its sections are these: an index past them is stale.
      if (sections?.some((index) => index >= current.length) === true) return changed;

      const status = await readStatusFile(project, locale.id);
      if (!status.ok) return status;
      const pages = new Map(status.value.file.pages);
      pages.set(
        key,
        markSections(
          current,
          pages.get(key) ?? null,
          sections === null ? 'all' : new Set(sections),
        ),
      );
      // Everything else in the file (other pages, catalogs) is written back as read.
      const file = { ...status.value.file, pages };
      const written = await project.writer.writeText(path, serializeStatusFile(file), {
        createFolders: true,
      });
      if (!written.ok) return err({ code: 'workspace.status-unwritable', cause: written.error });
      return ok(documentStatus(source, file, key, await project.files.exists(targetPath.value)));
    });
  };
}

/**
 * Records every translated message of the catalogs that have no record yet, against its source as
 * it is now. A catalog whose files can't be read is left as it is: it lists with its problem.
 */
async function recordExistingMessages(
  project: OpenedProject,
  recorded: ReadonlyMap<string, CatalogRecord>,
): Promise<Result<Map<string, CatalogRecord>, FormatError>> {
  const records = new Map<string, CatalogRecord>();
  const locale = project.targetLocale;
  if (project.catalogs === null || locale === null) return ok(records);
  const { format, layout } = project.catalogs;
  const catalogs = await layout.listCatalogs();
  if (!catalogs.ok) return catalogs;
  for (const catalog of catalogs.value) {
    if (recorded.has(catalog.key)) continue;
    const targetPath = layout.targetPathFor(catalog, locale.id);
    if (!targetPath.ok) return targetPath;
    const source = await readCatalogFile(project, format, catalog.path, 'source');
    const target = await readCatalogFile(project, format, targetPath.value, 'target');
    if (!source.ok || !target.ok) continue;
    const translations = new Map(target.value?.map((message) => [message.key, message.text]));
    // A catalog with nothing translated gets an empty record, which the status file leaves out.
    const record = recordMessages(
      undefined,
      (source.value ?? []).map((message) => ({
        key: message.key,
        source: message.text,
        translation: translations.get(message.key) ?? null,
      })),
    );
    records.set(catalog.key, record);
  }
  return ok(records);
}

/**
 * Marks every existing translation without a record up to date with its source as it is now: the
 * one-time start for a project translated before Paper Lion. Pages and catalogs already recorded
 * keep theirs; in the others, every translated message is recorded. Returns the keys of the
 * pages it marked, and how many messages.
 */
export function createMarkExistingUpToDate(deps: Dependencies): MarkExistingUpToDate {
  return async (projectId) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const locale = project.targetLocale;
    if (locale === null) return err({ code: 'workspace.no-target-locale' });
    const layout = project.documents?.layout ?? null;
    const documents = layout === null ? ok([]) : await layout.listSourceDocuments();
    if (!documents.ok) return documents;

    const path = statusFilePath(locale.id);
    return deps.updates.run(`${project.location}\n${path}`, async () => {
      const status = await readStatusFile(project, locale.id);
      if (!status.ok) return status;
      const pages = new Map<string, PageRecord>(status.value.file.pages);
      const marked: DocumentKey[] = [];
      for (const document of documents.value) {
        if (layout === null || pages.has(document.key)) continue;
        const targetPath = layout.targetPathFor(document, locale.id);
        if (!targetPath.ok) return targetPath;
        if (!(await project.files.exists(targetPath.value))) continue;
        const text = await project.files.readText(document.path);
        if (!text.ok) return err({ code: 'workspace.document-unreadable', cause: text.error });
        const source = deps.parser.parse(text.value, parseOptions(document.path));
        pages.set(document.key, markSections(sectionFingerprints(source), null, 'all'));
        marked.push(document.key);
      }
      const recorded = await recordExistingMessages(project, status.value.file.catalogs);
      if (!recorded.ok) return recorded;
      let markedMessages = 0;
      for (const record of recorded.value.values()) markedMessages += record.size;
      if (marked.length === 0 && markedMessages === 0) return ok({ marked, markedMessages });
      const catalogs = new Map([...status.value.file.catalogs, ...recorded.value]);
      const file = { ...status.value.file, pages, catalogs };
      const written = await project.writer.writeText(path, serializeStatusFile(file), {
        createFolders: true,
      });
      if (!written.ok) return err({ code: 'workspace.status-unwritable', cause: written.error });
      return ok({ marked, markedMessages });
    });
  };
}
