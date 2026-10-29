// SPDX-License-Identifier: GPL-3.0-or-later
// The languages a project has, and the catalog that knows all of them. Shared by opening a project
// and by the target-language use cases.
import type { DocumentLayout } from '#domains/formats';
import type { Language, LanguageCatalog } from '#domains/locale';
import type { LocaleId } from '#kernel/locale-id';
import type { ProjectConfig } from '../domain/project-config.ts';
import type { OpenedProject } from './ports/project-sessions.ts';

/**
 * The bundled catalog with the project's own languages: the config's `languages` (new codes, or
 * adjusted directions), and locale folders whose codes the catalog doesn't know, so every language
 * already in the project can be shown and chosen.
 */
export function projectCatalog(
  bundled: LanguageCatalog,
  config: ProjectConfig,
  layout: Pick<DocumentLayout, 'locales'>,
): LanguageCatalog {
  const configured = new Set(config.languages.map((language) => language.tag.toLowerCase()));
  const unknownFolders = layout.locales
    .map(({ locale }) => locale)
    .filter((tag) => bundled.find(tag) === undefined && !configured.has(tag.toLowerCase()))
    .map((tag) => ({ tag }));
  return bundled.withCustom([...unknownFolders, ...config.languages]);
}

/**
 * The project's languages that could be its target: its locales, the languages its config defines,
 * and the current target, without the source. Each once, in that order.
 */
export function projectTargetLocales(project: OpenedProject): LocaleId[] {
  const candidates = [
    ...project.layout.locales.map(({ locale }) => locale),
    ...project.config.languages.map(({ tag }) => tag),
    ...(project.targetLocale === null ? [] : [project.targetLocale.id]),
  ];
  const seen = new Set<string>([project.sourceLocale.id.toLowerCase()]);
  return candidates.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A language as the picker shows it: its name in the interface language, and its own name. */
export interface LanguageEntry {
  readonly tag: LocaleId;
  /** The name in the interface language (falling back to English). */
  readonly name: string;
  /** The language's name in itself, when known. */
  readonly autonym: string | null;
  readonly direction: 'ltr' | 'rtl';
}

export function languageEntry(
  catalog: LanguageCatalog,
  language: Language,
  uiLanguage: string,
): LanguageEntry {
  return {
    tag: language.tag,
    name: catalog.nameIn(language, uiLanguage),
    autonym: language.autonym,
    direction: language.direction,
  };
}
