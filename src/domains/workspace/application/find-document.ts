// SPDX-License-Identifier: GPL-3.0-or-later
import type { SourceDocument } from '#domains/document';
import type { FormatError, GuardedDocumentLayout } from '#domains/formats';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';

export interface FoundDocument {
  readonly document: SourceDocument;
  readonly layout: GuardedDocumentLayout;
}

export type FindDocumentError =
  { readonly code: 'workspace.unknown-document'; readonly key: string } | FormatError;

/** A source document of the project by key, with the layout it belongs to. A project without
 * pages has no documents: every key is unknown. */
export async function findDocument(
  project: OpenedProject,
  key: string,
): Promise<Result<FoundDocument, FindDocumentError>> {
  if (project.documents === null) return err({ code: 'workspace.unknown-document', key });
  const { layout } = project.documents;
  const documents = await layout.listSourceDocuments();
  if (!documents.ok) return documents;
  const document = documents.value.find((candidate) => candidate.key === key);
  return document === undefined
    ? err({ code: 'workspace.unknown-document', key })
    : ok({ document, layout });
}
