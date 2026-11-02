// SPDX-License-Identifier: GPL-3.0-or-later
import { localeId, type LocaleId } from '#kernel/locale-id';
import { err, ok, type Result } from '#kernel/result';

/** The project's config file, at the project root. */
export const CONFIG_FILE_NAME = 'paperl10n.config.json';

export const DEFAULT_SOURCE_LOCALE = 'en';

/** `paperl10n.config.json`, version 0. */
export interface ProjectConfig {
  readonly sourceLocale: LocaleId;
  /** Absent until the user chooses one; the app then asks for it. */
  readonly targetLocale?: LocaleId;
  /** Pins a document format plugin by id, instead of detecting one. */
  readonly documentFormat?: string;
  /** Pins a catalog format plugin by id, instead of detecting one. */
  readonly catalogFormat?: string;
  /** Each plugin's own options, keyed by plugin id. Plugins validate their section. */
  readonly formatOptions: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Languages the project defines (codes the catalog doesn't know) or adjusts (a direction). */
  readonly languages: readonly ConfiguredLanguage[];
}

/** One entry of the config's `languages`: `"rhg": { "dir": "ltr" }`, `"art-x-lantern": { "name": "Lanternese" }`. */
export interface ConfiguredLanguage {
  readonly tag: LocaleId;
  readonly name?: string;
  readonly direction?: 'ltr' | 'rtl';
}

export interface ConfigProblem {
  readonly field: string;
  readonly problem: string;
}

export interface InvalidConfig {
  readonly code: 'workspace.config-invalid';
  readonly problems: readonly ConfigProblem[];
}

export interface ParsedConfig {
  readonly config: ProjectConfig;
  /** Things that don't stop the project from opening, such as unknown keys. */
  readonly warnings: readonly string[];
}

const KNOWN_KEYS = [
  '$schema',
  'sourceLocale',
  'targetLocale',
  'documentFormat',
  'catalogFormat',
  'formatOptions',
  'languages',
];
const LANGUAGE_KEYS = ['name', 'dir'];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses and validates the config file's text. Reports every problem at once. */
export function parseProjectConfig(text: string): Result<ParsedConfig, InvalidConfig> {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : 'unknown error';
    return err({
      code: 'workspace.config-invalid',
      problems: [{ field: '(file)', problem: `not valid JSON: ${reason}` }],
    });
  }
  if (!isRecord(input)) {
    return err({
      code: 'workspace.config-invalid',
      problems: [{ field: '(file)', problem: 'must be a JSON object' }],
    });
  }

  const problems: ConfigProblem[] = [];
  const warnings = Object.keys(input)
    .filter((key) => !KNOWN_KEYS.includes(key))
    .map((key) => `unknown key "${key}" is ignored`);

  const readLocale = (field: string, raw: unknown): LocaleId | undefined => {
    if (typeof raw !== 'string') {
      problems.push({ field, problem: 'must be a locale id such as "en" or "pt-BR"' });
      return undefined;
    }
    const id = localeId(raw);
    if (!id.ok) problems.push({ field, problem: `"${raw}" isn't a valid locale id` });
    return id.ok ? id.value : undefined;
  };

  const sourceLocale = readLocale('sourceLocale', input.sourceLocale ?? DEFAULT_SOURCE_LOCALE);
  const targetLocale =
    input.targetLocale === undefined ? undefined : readLocale('targetLocale', input.targetLocale);
  if (sourceLocale !== undefined && sourceLocale === targetLocale) {
    problems.push({ field: 'targetLocale', problem: 'must differ from sourceLocale' });
  }

  const pinnedFormat = (field: 'documentFormat' | 'catalogFormat', example: string) => {
    const value = input[field];
    if (value === undefined) return {};
    if (typeof value === 'string' && value !== '') return { [field]: value };
    problems.push({ field, problem: `must be a plugin id such as "${example}"` });
    return {};
  };
  const documentFormat = pinnedFormat('documentFormat', 'format-vitepress');
  const catalogFormat = pinnedFormat('catalogFormat', 'catalog-banana');

  const formatOptions: Record<string, Readonly<Record<string, unknown>>> = {};
  const rawOptions = input.formatOptions ?? {};
  if (!isRecord(rawOptions)) {
    problems.push({ field: 'formatOptions', problem: 'must be an object keyed by plugin id' });
  } else {
    for (const [plugin, options] of Object.entries(rawOptions)) {
      if (isRecord(options)) formatOptions[plugin] = options;
      else problems.push({ field: `formatOptions.${plugin}`, problem: 'must be an object' });
    }
  }

  const languages: ConfiguredLanguage[] = [];
  const rawLanguages = input.languages ?? {};
  if (!isRecord(rawLanguages)) {
    problems.push({ field: 'languages', problem: 'must be an object keyed by locale id' });
  } else {
    for (const [code, entry] of Object.entries(rawLanguages)) {
      const field = `languages.${code}`;
      const tag = localeId(code);
      if (!tag.ok) {
        problems.push({ field, problem: `"${code}" isn't a valid locale id` });
        continue;
      }
      if (!isRecord(entry)) {
        problems.push({ field, problem: 'must be an object with "name" and/or "dir"' });
        continue;
      }
      const unknownKeys = Object.keys(entry).filter((key) => !LANGUAGE_KEYS.includes(key));
      if (unknownKeys.length > 0) {
        problems.push({ field, problem: `unknown key(s): ${unknownKeys.join(', ')}` });
      }
      const { name, dir } = entry;
      if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
        problems.push({ field: `${field}.name`, problem: 'must be a non-empty string' });
      }
      if (dir !== undefined && dir !== 'ltr' && dir !== 'rtl') {
        problems.push({ field: `${field}.dir`, problem: 'must be "ltr" or "rtl"' });
      }
      languages.push({
        tag: tag.value,
        ...(typeof name === 'string' && name.trim() !== '' ? { name: name.trim() } : {}),
        ...(dir === 'ltr' || dir === 'rtl' ? { direction: dir } : {}),
      });
    }
  }

  if (problems.length > 0 || sourceLocale === undefined) {
    return err({ code: 'workspace.config-invalid', problems });
  }
  return ok({
    config: {
      sourceLocale,
      ...(targetLocale === undefined ? {} : { targetLocale }),
      ...documentFormat,
      ...catalogFormat,
      formatOptions,
      languages,
    },
    warnings,
  });
}
