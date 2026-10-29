// SPDX-License-Identifier: GPL-3.0-or-later
// What the target-language picker shows: suggestions before the user types, and search results.
// Both use the open project's catalog (its own languages included) and never offer the source.
import { searchLanguages, suggestLanguages } from '#domains/locale';
import { err, ok, type Result } from '#kernel/result';
import type { ProjectSessions } from './ports/project-sessions.ts';
import { languageEntry, projectTargetLocales, type LanguageEntry } from './project-languages.ts';

export type TargetLanguagesError = { readonly code: 'workspace.unknown-project' };

export interface TargetLanguageSuggestions {
  /** Languages the project already has. */
  readonly inProject: readonly LanguageEntry[];
  /** The user's recent picks that this project doesn't have yet. */
  readonly recent: readonly LanguageEntry[];
  /** English, the OS languages, and the most spoken languages of the user's region. */
  readonly suggested: readonly LanguageEntry[];
}

export interface SuggestionRequest {
  /** The user's recent picks, most recent first (kept by the UI, ADR 0016). */
  readonly recent: readonly string[];
  /** The OS languages, best first. */
  readonly systemLanguages: readonly string[];
  /** The interface language, for the names. */
  readonly uiLanguage: string;
}

export type SuggestTargetLanguages = (
  projectId: string,
  request: SuggestionRequest,
) => Result<TargetLanguageSuggestions, TargetLanguagesError>;

export type SearchTargetLanguages = (
  projectId: string,
  request: { readonly query: string; readonly uiLanguage: string },
) => Result<readonly LanguageEntry[], TargetLanguagesError>;

export function createSuggestTargetLanguages(deps: {
  readonly sessions: ProjectSessions;
}): SuggestTargetLanguages {
  return (projectId, request) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const { catalog } = project;
    const sections = suggestLanguages(catalog, {
      projectLocales: projectTargetLocales(project),
      recent: request.recent,
      systemLanguages: request.systemLanguages,
      exclude: [project.sourceLocale.id],
    });
    const entries = (languages: typeof sections.inProject) =>
      languages.map((language) => languageEntry(catalog, language, request.uiLanguage));
    return ok({
      inProject: entries(sections.inProject),
      recent: entries(sections.recent),
      suggested: entries(sections.suggested),
    });
  };
}

/** How many results a search returns: enough to scroll, few enough to send at every keystroke. */
const SEARCH_LIMIT = 50;

export function createSearchTargetLanguages(deps: {
  readonly sessions: ProjectSessions;
}): SearchTargetLanguages {
  return (projectId, { query, uiLanguage }) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const { catalog } = project;
    const source = project.sourceLocale.id.toLowerCase();
    // One extra, in case the source is among the results.
    const found = searchLanguages(catalog, query, { uiLanguage, limit: SEARCH_LIMIT + 1 })
      .filter((language) => language.tag.toLowerCase() !== source)
      .slice(0, SEARCH_LIMIT);
    return ok(found.map((language) => languageEntry(catalog, language, uiLanguage)));
  };
}
