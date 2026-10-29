// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileAccessError } from '#domains/formats';
import { localeFrom, type Locale } from '#domains/locale';
import type { LocaleId } from '#kernel/locale-id';
import { projectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import { setConfigString } from '../domain/config-edit.ts';
import {
  CONFIG_FILE_NAME,
  parseProjectConfig,
  type InvalidConfig,
} from '../domain/project-config.ts';
import type { OpenedProject, ProjectSessions } from './ports/project-sessions.ts';
import type { FileWriteError } from './ports/project-writer.ts';

export type ChooseTargetLocaleError =
  | { readonly code: 'workspace.unknown-project' }
  | { readonly code: 'workspace.unknown-language'; readonly language: string }
  | { readonly code: 'workspace.target-is-source'; readonly language: string }
  | { readonly code: 'workspace.config-missing' }
  | { readonly code: 'workspace.config-unreadable'; readonly cause: FileAccessError }
  | InvalidConfig
  | { readonly code: 'workspace.config-unwritable'; readonly cause: FileWriteError };

export type ChooseTargetLocale = (
  projectId: string,
  language: string,
) => Promise<Result<Locale, ChooseTargetLocaleError>>;

/**
 * Makes a language the open project's target, and saves it as `targetLocale` in the config, so
 * the whole team shares it. The language must be one the project's catalog knows: a code it
 * doesn't is defined in the config's `languages` first.
 */
export function createChooseTargetLocale(deps: {
  readonly sessions: ProjectSessions;
}): ChooseTargetLocale {
  return async (projectId, language) => {
    const project = deps.sessions.get(projectId);
    if (project === undefined) return err({ code: 'workspace.unknown-project' });
    const known = project.catalog.find(language);
    if (known === undefined) return err({ code: 'workspace.unknown-language', language });
    if (known.tag.toLowerCase() === project.sourceLocale.id.toLowerCase()) {
      return err({ code: 'workspace.target-is-source', language: known.tag });
    }

    const saved = await saveTargetLocale(project, known.tag);
    if (!saved.ok) return saved;
    const target = localeFrom(known.tag, project.catalog);
    const updated: OpenedProject = {
      ...project,
      config: { ...project.config, targetLocale: known.tag },
      targetLocale: target,
    };
    if (!deps.sessions.update(projectId, updated)) {
      return err({ code: 'workspace.unknown-project' });
    }
    return ok(target);
  };
}

/**
 * Sets `targetLocale` in the config file as it is on disk now (someone may have edited it since
 * the project was opened), changing nothing else in it. Already set: nothing is written.
 */
async function saveTargetLocale(
  project: OpenedProject,
  tag: LocaleId,
): Promise<Result<void, ChooseTargetLocaleError>> {
  const configPath = projectPath(CONFIG_FILE_NAME);
  if (!configPath.ok) throw new Error('CONFIG_FILE_NAME must be a valid project path');
  const text = await project.files.readText(configPath.value);
  if (!text.ok) {
    return text.error.code === 'files.not-found'
      ? err({ code: 'workspace.config-missing' })
      : err({ code: 'workspace.config-unreadable', cause: text.error });
  }
  const current = parseProjectConfig(text.value);
  if (!current.ok) return current;
  if (current.value.config.targetLocale === tag) return ok(undefined);

  const edited = setConfigString(text.value, 'targetLocale', tag, { after: 'sourceLocale' });
  if (!edited.ok) return edited;
  const written = await project.writer.writeText(configPath.value, edited.value);
  return written.ok
    ? ok(undefined)
    : err({ code: 'workspace.config-unwritable', cause: written.error });
}
