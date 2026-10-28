// SPDX-License-Identifier: GPL-3.0-or-later
import type { Brand } from '#kernel/brand';
import type { LocaleId } from '#kernel/locale-id';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';

/**
 * The locale-independent identity of a document, e.g. `guide/getting-started`. A source document
 * and its translations share the same key; that's how they're paired. Same syntax as a
 * project path (relative, `/`-separated, no `..`), and never empty.
 */
export type DocumentKey = Brand<string, 'DocumentKey'>;

export interface InvalidDocumentKey {
  readonly code: 'document-key.invalid';
  readonly input: string;
}

export function documentKey(input: string): Result<DocumentKey, InvalidDocumentKey> {
  const path = projectPath(input);
  if (!path.ok || path.value === '') return err({ code: 'document-key.invalid', input });
  return ok(path.value as string as DocumentKey);
}

/** A document in the source locale, as found by a format plugin. */
export interface SourceDocument {
  readonly key: DocumentKey;
  readonly path: ProjectPath;
  readonly locale: LocaleId;
}
