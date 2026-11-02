// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileAccessError, FormatError } from '#domains/formats';
import type { ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { draftKey } from './drafts.ts';
import type { DraftStore } from './ports/draft-store.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';
import type { FileWriteError } from './ports/project-writer.ts';
import { findDocument } from './find-document.ts';

export interface SaveDocumentRequest {
  /** The page's document key. */
  readonly key: string;
  /** The translation's new text, written exactly as given. */
  readonly text: string;
  /**
   * The translation as it was when editing started: its text, or `null` when it didn't exist
   * (a page seeded from its source). Saving refuses if the file on disk is no longer that.
   */
  readonly base: string | null;
}

export type SaveDocumentError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-document'; readonly key: string }
  | { readonly code: 'workspace.document-changed'; readonly path: ProjectPath }
  | { readonly code: 'workspace.document-unreadable'; readonly cause: FileAccessError }
  | { readonly code: 'workspace.document-unwritable'; readonly cause: FileWriteError }
  | FormatError;

export type SaveDocument = (
  projectId: string,
  request: SaveDocumentRequest,
) => Promise<Result<{ readonly path: ProjectPath; readonly written: boolean }, SaveDocumentError>>;

/**
 * Saves a page's translation (for the project's target locale) atomically, creating missing
 * folders. Two guarantees (PRD §7.4): text that equals the file is never written (`written:
 * false`), and a file that changed on disk since editing started (git pull, another editor) is
 * never overwritten: that's `workspace.document-changed`, and the caller decides. Once the file
 * holds the text, the page's draft is forgotten (if that fails, the draft matches the file, and
 * reading the page drops it).
 */
export function createSaveDocument(deps: {
  readonly sessions: ProjectSessions;
  readonly drafts: DraftStore;
}): SaveDocument {
  return async (projectId, { key, text, base }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const targetLocale = project.targetLocale;
    if (targetLocale === null) return err({ code: 'workspace.no-target-locale' });

    const found = await findDocument(project, key);
    if (!found.ok) return found;
    const { document, layout } = found.value;
    const path = layout.targetPathFor(document, targetLocale.id);
    if (!path.ok) return path;

    const current = await project.files.readText(path.value);
    if (!current.ok && current.error.code !== 'files.not-found') {
      return err({ code: 'workspace.document-unreadable', cause: current.error });
    }
    const onDisk = current.ok ? current.value : null;
    if (onDisk !== base) return err({ code: 'workspace.document-changed', path: path.value });
    const forgetDraft = async () => {
      const draft = draftKey(project, key);
      if (draft !== null) await deps.drafts.remove(draft);
    };
    if (onDisk === text) {
      await forgetDraft();
      return ok({ path: path.value, written: false });
    }

    const written = await project.writer.writeText(path.value, text, { createFolders: true });
    if (!written.ok) return err({ code: 'workspace.document-unwritable', cause: written.error });
    await forgetDraft();
    return ok({ path: path.value, written: true });
  };
}
