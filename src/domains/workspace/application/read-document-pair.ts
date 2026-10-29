// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileAccessError, FormatError, ProjectFiles } from '#domains/formats';
import type { DocumentKey, MarkdownParser, ParsedDocument } from '#domains/document';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { ProjectSessions } from './ports/project-sessions.ts';

export interface ReadDocument {
  readonly path: ProjectPath;
  readonly document: ParsedDocument;
}

export interface DocumentPair {
  readonly key: DocumentKey;
  readonly source: ReadDocument;
  /** `null` when the translation file doesn't exist yet. */
  readonly target: ReadDocument | null;
}

export type ReadDocumentPairError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-document'; readonly key: string }
  | { readonly code: 'workspace.document-unreadable'; readonly cause: FileAccessError }
  | FormatError;

export type ReadDocumentPair = (
  projectId: string,
  key: string,
) => Promise<Result<DocumentPair, ReadDocumentPairError>>;

/** `.mdx` files get MDX tolerance; everything else is plain Markdown. */
const parseOptions = (path: ProjectPath) => ({ mdx: path.endsWith('.mdx') });

async function read(
  files: ProjectFiles,
  path: ProjectPath,
  parser: MarkdownParser,
): Promise<Result<ReadDocument | null, ReadDocumentPairError>> {
  const text = await files.readText(path);
  if (!text.ok) {
    return text.error.code === 'files.not-found'
      ? ok(null)
      : err({ code: 'workspace.document-unreadable', cause: text.error });
  }
  return ok({ path, document: parser.parse(text.value, parseOptions(path)) });
}

/**
 * Reads a page's source document and its translation for the project's target locale, and parses
 * both. A missing translation is `null`, not an error: it just hasn't been started.
 */
export function createReadDocumentPair(deps: {
  readonly sessions: ProjectSessions;
  readonly parser: MarkdownParser;
}): ReadDocumentPair {
  return async (projectId, key) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const targetLocale = project.targetLocale;
    if (targetLocale === null) return err({ code: 'workspace.no-target-locale' });

    const documents = await project.layout.listSourceDocuments();
    if (!documents.ok) return documents;
    const document = documents.value.find((candidate) => candidate.key === key);
    if (document === undefined) return err({ code: 'workspace.unknown-document', key });

    const targetPath = project.layout.targetPathFor(document, targetLocale.id);
    if (!targetPath.ok) return targetPath;

    const source = await read(project.files, document.path, deps.parser);
    if (!source.ok) return source;
    // The plugin listed it, so a vanished source file is a read problem, not a missing translation.
    if (source.value === null) {
      return err({
        code: 'workspace.document-unreadable',
        cause: { code: 'files.not-found', path: document.path },
      });
    }
    const target = await read(project.files, targetPath.value, deps.parser);
    if (!target.ok) return target;
    return ok({ key: document.key, source: source.value, target: target.value });
  };
}
