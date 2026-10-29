// SPDX-License-Identifier: GPL-3.0-or-later
import { documentKey } from '#domains/document';
import { err, ok, type Result } from '#kernel/result';
import type { DraftKey, DraftStore } from './ports/draft-store.ts';
import type { OpenedProject, ProjectSessions } from './ports/project-sessions.ts';

export interface SaveDraftRequest {
  readonly key: string;
  /** The editor's text, as it would be saved. */
  readonly text: string;
  /** The translation as it was when editing started (see saveDocument), or `null` for a new one. */
  readonly base: string | null;
}

export type DraftError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-document'; readonly key: string }
  | { readonly code: 'workspace.draft-unwritable' };

export type SaveDraft = (
  projectId: string,
  request: SaveDraftRequest,
) => Promise<Result<void, DraftError>>;
export type DiscardDraft = (projectId: string, key: string) => Promise<Result<void, DraftError>>;

/** The draft key for a page of an open project, in its target language. */
export function draftKey(project: OpenedProject, key: string): DraftKey | null {
  return project.targetLocale === null
    ? null
    : { project: project.location, locale: project.targetLocale.id, document: key };
}

function keyFor(
  sessions: ProjectSessions,
  projectId: string,
  key: string,
): Result<DraftKey, Exclude<DraftError, { code: 'workspace.draft-unwritable' }>> {
  const project = sessions.get(projectId);
  if (project === undefined) return err({ code: 'workspace.unknown-project' });
  // Only a well-formed key: drafts are kept by key, so it needn't be listed (that would read the
  // project on every autosave), and a page that's gone just leaves a draft nobody opens.
  if (!documentKey(key).ok) return err({ code: 'workspace.unknown-document', key });
  const found = draftKey(project, key);
  return found === null ? err({ code: 'workspace.no-target-locale' }) : ok(found);
}

/**
 * Keeps a page's unsaved edits as a draft in the app's data (never in the project), so they
 * survive a crash or a restart. The renderer calls it as you type (debounced).
 */
export function createSaveDraft(deps: {
  readonly sessions: ProjectSessions;
  readonly drafts: DraftStore;
}): SaveDraft {
  return async (projectId, { key, text, base }) => {
    const found = keyFor(deps.sessions, projectId, key);
    if (!found.ok) return found;
    const kept = await deps.drafts.put(found.value, { text, base });
    return kept.ok ? ok(undefined) : err({ code: 'workspace.draft-unwritable' });
  };
}

/** Forgets a page's draft: its edits were dropped (or match the file again). */
export function createDiscardDraft(deps: {
  readonly sessions: ProjectSessions;
  readonly drafts: DraftStore;
}): DiscardDraft {
  return async (projectId, key) => {
    const found = keyFor(deps.sessions, projectId, key);
    if (!found.ok) return found;
    const removed = await deps.drafts.remove(found.value);
    return removed.ok ? ok(undefined) : err({ code: 'workspace.draft-unwritable' });
  };
}
