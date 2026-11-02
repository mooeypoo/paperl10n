// SPDX-License-Identifier: GPL-3.0-or-later
// A catalog's unsaved edits, kept as a draft in the app's data (never in the project), so they
// survive a crash or a restart, as a page's do (docs/plan/M4-catalogs.md, question 8). Catalog
// drafts use the same `DraftStore` port as pages, in a store of their own: a draft per catalog,
// keyed by the catalog's key, whose text holds the edited messages as JSON.
import { catalogKey } from '#domains/catalog';
import { err, ok, type Result } from '#kernel/result';
import type { Draft, DraftKey, DraftStore } from './ports/draft-store.ts';
import type { OpenedProject, ProjectSessions } from './ports/project-sessions.ts';
import type { MessageSave } from './save-catalog.ts';

/** A catalog's unsaved edits: each edited message as it would be saved. */
export interface CatalogDraft {
  readonly messages: readonly MessageSave[];
}

export type CatalogDraftError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.no-target-locale' }
  | { readonly code: 'workspace.unknown-catalog'; readonly key: string }
  | { readonly code: 'workspace.draft-unwritable' };

export type SaveCatalogDraft = (
  projectId: string,
  request: { readonly catalog: string; readonly messages: readonly MessageSave[] },
) => Promise<Result<void, CatalogDraftError>>;
export type DiscardCatalogDraft = (
  projectId: string,
  catalog: string,
) => Promise<Result<void, CatalogDraftError>>;

/** The draft key for a catalog of an open project, in its target language. */
export function catalogDraftKey(project: OpenedProject, catalog: string): DraftKey | null {
  return project.targetLocale === null
    ? null
    : { project: project.location, locale: project.targetLocale.id, document: catalog };
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown) => value === null || isText(value);

/** A stored draft's messages, or `null` when it isn't a catalog draft (corrupt, or another shape). */
function decode(draft: Draft): CatalogDraft | null {
  let value: unknown;
  try {
    value = JSON.parse(draft.text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { messages } = value as Record<string, unknown>;
  if (!Array.isArray(messages)) return null;
  const valid = messages.every((message: unknown) => {
    // From JSON: reading a primitive's fields gives `undefined`, but `null` has none to read.
    if (message === null) return false;
    const { key, text, base, source } = message as Record<string, unknown>;
    return isText(key) && isText(text) && isTextOrNull(base) && isTextOrNull(source);
  });
  return valid ? { messages: messages as MessageSave[] } : null;
}

function encode(messages: readonly MessageSave[]): Draft {
  return {
    text: JSON.stringify({
      messages: messages.map(({ key, text, base, source }) => ({ key, text, base, source })),
    }),
    base: null,
  };
}

/** A catalog's draft; none when there's none, or it can't be read as one (it's help, not work
 * that should block opening the catalog). */
export async function readCatalogDraft(
  drafts: DraftStore,
  key: DraftKey | null,
): Promise<CatalogDraft | null> {
  if (key === null) return null;
  const stored = await drafts.get(key);
  return stored.ok && stored.value !== null ? decode(stored.value) : null;
}

/**
 * Keeps only the draft's messages `keep` accepts, forgetting the draft when none is left. Best
 * effort: a draft that can't be updated is harmless (its messages are dropped again next time).
 */
export async function keepDraftMessages(
  drafts: DraftStore,
  key: DraftKey | null,
  draft: CatalogDraft,
  keep: (message: MessageSave) => boolean,
): Promise<CatalogDraft | null> {
  const kept = draft.messages.filter(keep);
  if (key !== null && kept.length !== draft.messages.length) {
    await (kept.length === 0 ? drafts.remove(key) : drafts.put(key, encode(kept)));
  }
  return kept.length === 0 ? null : { messages: kept };
}

function keyFor(
  sessions: ProjectSessions,
  projectId: string,
  catalog: string,
): Result<DraftKey, Exclude<CatalogDraftError, { code: 'workspace.draft-unwritable' }>> {
  const project = sessions.get(projectId);
  if (project === undefined) return err({ code: 'workspace.unknown-project' });
  // Only a well-formed key, as for pages: listing catalogs on every autosave would read the
  // project, and a catalog that's gone just leaves a draft nobody opens.
  if (!catalogKey(catalog).ok) return err({ code: 'workspace.unknown-catalog', key: catalog });
  const found = catalogDraftKey(project, catalog);
  return found === null ? err({ code: 'workspace.no-target-locale' }) : ok(found);
}

/**
 * Keeps a catalog's unsaved edits as its draft, replacing the last one; no edits forget it. The
 * renderer calls it as you type (debounced).
 */
export function createSaveCatalogDraft(deps: {
  readonly sessions: ProjectSessions;
  readonly catalogDrafts: DraftStore;
}): SaveCatalogDraft {
  return async (projectId, { catalog, messages }) => {
    const found = keyFor(deps.sessions, projectId, catalog);
    if (!found.ok) return found;
    const kept =
      messages.length === 0
        ? await deps.catalogDrafts.remove(found.value)
        : await deps.catalogDrafts.put(found.value, encode(messages));
    return kept.ok ? ok(undefined) : err({ code: 'workspace.draft-unwritable' });
  };
}

/** Forgets a catalog's draft: its edits were dropped. */
export function createDiscardCatalogDraft(deps: {
  readonly sessions: ProjectSessions;
  readonly catalogDrafts: DraftStore;
}): DiscardCatalogDraft {
  return async (projectId, catalog) => {
    const found = keyFor(deps.sessions, projectId, catalog);
    if (!found.ok) return found;
    const removed = await deps.catalogDrafts.remove(found.value);
    return removed.ok ? ok(undefined) : err({ code: 'workspace.draft-unwritable' });
  };
}
