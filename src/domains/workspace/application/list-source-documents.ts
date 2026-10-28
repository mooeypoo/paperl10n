// SPDX-License-Identifier: GPL-3.0-or-later
import type { FormatError } from '#domains/formats';
import type { DocumentKey } from '#domains/document';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { ProjectSessions } from './ports/project-sessions.ts';

export interface SourceDocumentEntry {
  readonly key: DocumentKey;
  readonly sourcePath: ProjectPath;
  /** Where the translation lives (or will live) for the project's target locale. */
  readonly targetPath: ProjectPath;
  /** Whether that translation file exists yet. */
  readonly targetExists: boolean;
}

export type ListSourceDocumentsError = { readonly code: 'workspace.unknown-project' } | FormatError;

export type ListSourceDocuments = (
  projectId: string,
) => Promise<Result<readonly SourceDocumentEntry[], ListSourceDocumentsError>>;

/** The open project's source documents, each with its target path and whether it exists. */
export function createListSourceDocuments(deps: {
  readonly sessions: ProjectSessions;
}): ListSourceDocuments {
  return async (projectId) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });

    const documents = await project.layout.listSourceDocuments();
    if (!documents.ok) return documents;

    const entries: SourceDocumentEntry[] = [];
    for (const document of documents.value) {
      const targetPath = project.layout.targetPathFor(document, project.targetLocale.id);
      if (!targetPath.ok) return targetPath;
      entries.push({
        key: document.key,
        sourcePath: document.path,
        targetPath: targetPath.value,
        targetExists: await project.files.exists(targetPath.value),
      });
    }
    return ok(entries);
  };
}
