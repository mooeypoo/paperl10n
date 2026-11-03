// SPDX-License-Identifier: GPL-3.0-or-later
// Checking a message's translation as it's written, against its source on disk
// (docs/domains/catalog.md): the translation's tokens, for the editor to mark, and the warnings.
// The editor calls it as the translation changes, after a pause; it reads, never writes.
import {
  checkForms,
  checkMessage,
  type MessageWarning,
  type PlaceholderToken,
} from '#domains/catalog';
import { err, ok, type Result } from '#kernel/result';
import { readCatalogFile, scanText, type CatalogReadError } from './catalog-files.ts';
import { findCatalog, type FindCatalogError } from './find-catalog.ts';
import type { ProjectSessions } from './ports/project-sessions.ts';

/** One text's check: its tokens, and what it lost or gained against its source. */
export interface TextCheck {
  /** The text's tokens, as the plugin's scanner finds them. */
  readonly tokens: readonly PlaceholderToken[];
  /** What the text lost or gained against its source. Warnings only. */
  readonly warnings: readonly MessageWarning[];
}

/** A translation's check: the text's (the first form's, with forms), and each form's. */
export interface MessageCheck extends TextCheck {
  /** Each plural form's check, when the request has forms (`null`: none). */
  readonly forms: readonly TextCheck[] | null;
}

export type CheckMessageError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.unknown-message'; readonly catalog: string; readonly key: string }
  | FindCatalogError
  | CatalogReadError;

export type CheckMessage = (
  projectId: string,
  request: {
    readonly catalog: string;
    readonly key: string;
    readonly text: string;
    /** Every plural form, for a message whose catalog keeps them apart (`text` is the first). */
    readonly forms?: readonly string[];
  },
) => Promise<Result<MessageCheck, CheckMessageError>>;

/**
 * Checks `text`, a message's translation as it's written now (saved or not), against the source
 * message with that key in the catalog's source file; with `forms`, each plural form against the
 * source's forms (`checkForms`: a form for one number may drop the count).
 */
export function createCheckMessage(deps: { readonly sessions: ProjectSessions }): CheckMessage {
  return async (projectId, { catalog: catalogKey, key, text, forms }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const found = await findCatalog(project, catalogKey);
    if (!found.ok) return found;
    const { catalog, format } = found.value;

    const source = await readCatalogFile(project, format, catalog.path, 'source');
    if (!source.ok) return source;
    const message = source.value?.find((candidate) => candidate.key === key);
    if (message === undefined) {
      return err({ code: 'workspace.unknown-message', catalog: catalogKey, key });
    }
    const scan = (form: string) => ({ text: form, tokens: scanText(format, form, message) });
    if (forms !== undefined) {
      const translated = forms.map(scan);
      const warnings = checkForms((message.forms ?? [message.text]).map(scan), translated);
      const checked = translated.map((form, index) => ({
        tokens: form.tokens,
        warnings: warnings[index] ?? [],
      }));
      return ok({ ...(checked[0] ?? { tokens: [], warnings: [] }), forms: checked });
    }
    const tokens = scanText(format, text, message);
    const warnings = checkMessage(scan(message.text), { text, tokens });
    return ok({ tokens, warnings, forms: null });
  };
}
