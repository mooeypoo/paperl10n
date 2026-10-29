// SPDX-License-Identifier: GPL-3.0-or-later
import { localeFrom, type Locale } from '#domains/locale';
import { err, ok, type Result } from '#kernel/result';
import type { ProjectSessions } from './ports/project-sessions.ts';

export type ChooseTargetLocaleError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.unknown-language'; readonly language: string }
  | { readonly code: 'workspace.target-is-source'; readonly language: string };

export type ChooseTargetLocale = (
  projectId: string,
  language: string,
) => Result<Locale, ChooseTargetLocaleError>;

/**
 * Makes a language the open project's target, for this session. The language must be one the
 * project's catalog knows: a code it doesn't is defined in the config's `languages` first.
 * Saving the choice to the config file is a separate step (docs/plan/M1-languages.md, L4).
 */
export function createChooseTargetLocale(deps: {
  readonly sessions: ProjectSessions;
}): ChooseTargetLocale {
  return (projectId, language) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const known = project.catalog.find(language);
    if (known === undefined) return err({ code: 'workspace.unknown-language', language });
    if (known.tag.toLowerCase() === project.sourceLocale.id.toLowerCase()) {
      return err({ code: 'workspace.target-is-source', language: known.tag });
    }
    const target = localeFrom(known.tag, project.catalog);
    if (!deps.sessions.update(projectId, { ...project, targetLocale: target })) {
      return err({ code: 'workspace.unknown-project' });
    }
    return ok(target);
  };
}
