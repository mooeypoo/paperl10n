// SPDX-License-Identifier: GPL-3.0-or-later
import type { FormatError } from '#domains/formats';
import type { DocumentKey, MarkdownParser } from '#domains/document';
import { emptyStatusFile, type PageStatus } from '#domains/translation';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { DraftStore } from './ports/draft-store.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';
import { documentPageStatus, readStatusFile, type StatusReadError } from './translation-status.ts';

export interface SourceDocumentEntry {
  readonly key: DocumentKey;
  readonly sourcePath: ProjectPath;
  /** Where the translation lives (or will live) for the project's target locale. */
  readonly targetPath: ProjectPath;
  /** Whether that translation file exists yet. */
  readonly targetExists: boolean;
  /** Whether unsaved edits to it are kept as a draft. */
  readonly hasDraft: boolean;
  /** Up to date with its source or not (docs/domains/translation.md). */
  readonly status: PageStatus;
}

export interface SourceDocumentList {
  readonly documents: readonly SourceDocumentEntry[];
  /** The target language's status file: whether it exists, and why it can't be read, if not. */
  readonly statusFile: {
    readonly exists: boolean;
    /** Pages are listed as never recorded then, and marking is refused until it's fixed. */
    readonly problem: StatusReadError | null;
  };
}

export type ListSourceDocumentsError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | FormatError;

export type ListSourceDocuments = (
  projectId: string,
) => Promise<Result<SourceDocumentList, ListSourceDocumentsError>>;

/**
 * The open project's source documents, each with its target path, whether it exists, whether it
 * has a draft, and its status. Drafts that can't be listed count as none, and a status file that
 * can't be read as empty: the pages still list. Only recorded pages with a translation have their
 * source read (status needs the source and its record, never the translation's text).
 */
export function createListSourceDocuments(deps: {
  readonly sessions: ProjectSessions;
  readonly drafts: DraftStore;
  readonly parser: MarkdownParser;
}): ListSourceDocuments {
  return async (projectId) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const target = project.targetLocale;
    if (target === null) return err({ code: 'workspace.no-target-locale' });

    const documents = await project.layout.listSourceDocuments();
    if (!documents.ok) return documents;

    const drafted = await deps.drafts.documents(project.location, target.id);
    const withDrafts = new Set<string>(drafted.ok ? drafted.value : []);
    const read = await readStatusFile(project, target.id);
    const file = read.ok ? read.value.file : emptyStatusFile;
    const entries: SourceDocumentEntry[] = [];
    for (const document of documents.value) {
      const targetPath = project.layout.targetPathFor(document, target.id);
      if (!targetPath.ok) return targetPath;
      const targetExists = await project.files.exists(targetPath.value);
      let status: PageStatus = targetExists ? 'draft' : 'missing';
      if (targetExists && file.pages.has(document.key)) {
        const text = await project.files.readText(document.path);
        // An unreadable source claims nothing; opening the page shows why.
        if (text.ok) {
          const source = deps.parser.parse(text.value, { mdx: document.path.endsWith('.mdx') });
          status = documentPageStatus(source, file, document.key, true);
        }
      }
      entries.push({
        key: document.key,
        sourcePath: document.path,
        targetPath: targetPath.value,
        targetExists,
        hasDraft: withDrafts.has(document.key),
        status,
      });
    }
    return ok({
      documents: entries,
      statusFile: {
        exists: read.ok && read.value.exists,
        problem: read.ok ? null : read.error,
      },
    });
  };
}
