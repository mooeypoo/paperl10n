// SPDX-License-Identifier: GPL-3.0-or-later
// Checking a translation as it's written, against its source on disk: the preservation hints and
// the length note (docs/domains/translation.md). The editor calls it as the translation changes;
// it reads, never writes.
import type { FileAccessError, FormatError } from '#domains/formats';
import type { MarkdownParser } from '#domains/document';
import { checkTranslation, type TranslationCheck } from '#domains/translation';
import { err, ok, type Result } from '#kernel/result';
import type { ProjectSessions } from './ports/project-sessions.ts';
import { findDocument } from './find-document.ts';

export type CheckTranslationError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-document'; readonly key: string }
  | { readonly code: 'workspace.document-unreadable'; readonly cause: FileAccessError }
  | FormatError;

export type CheckTranslation = (
  projectId: string,
  request: { readonly key: string; readonly text: string },
) => Promise<Result<TranslationCheck, CheckTranslationError>>;

/**
 * Checks `text`, a page's translation as it's written now (saved or not), against the page's
 * source: each is parsed as its own file would be (MDX for `.mdx`), and the translation's links
 * are read in the source's form through the format plugin.
 */
export function createCheckTranslation(deps: {
  readonly sessions: ProjectSessions;
  readonly parser: MarkdownParser;
}): CheckTranslation {
  return async (projectId, { key, text }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const targetLocale = project.targetLocale;
    if (targetLocale === null) return err({ code: 'workspace.no-target-locale' });

    const found = await findDocument(project, key);
    if (!found.ok) return found;
    const { document, layout } = found.value;
    const targetPath = layout.targetPathFor(document, targetLocale.id);
    if (!targetPath.ok) return targetPath;

    const sourceText = await project.files.readText(document.path);
    if (!sourceText.ok)
      return err({ code: 'workspace.document-unreadable', cause: sourceText.error });
    const source = deps.parser.parse(sourceText.value, { mdx: document.path.endsWith('.mdx') });
    const translation = deps.parser.parse(text, { mdx: targetPath.value.endsWith('.mdx') });
    // A plugin whose mapping fails leaves the link as written: a hint is never worth an error.
    const sourceLinkTarget = (target: string) => {
      const mapped = layout.sourceLinkTarget(target, targetLocale.id);
      return mapped.ok ? mapped.value : target;
    };
    return ok(checkTranslation(source, translation, sourceLinkTarget));
  };
}
