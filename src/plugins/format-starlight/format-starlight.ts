// SPDX-License-Identifier: GPL-3.0-or-later
// Astro Starlight docs sites (https://starlight.astro.build): pages in `src/content/docs/`, one
// folder per locale. The default locale is either the root of that folder ("root" locale) or a
// folder of its own. Starlight's own locale config is JavaScript (astro.config.mjs), which a plugin
// can't run, so folders follow Starlight's conventions and can be named in paperl10n.config.json.
import {
  documentKey,
  err,
  localeId,
  ok,
  PROJECT_ROOT,
  projectPath,
  type Detection,
  type DocumentFormat,
  type DocumentLayout,
  type FormatContext,
  type LocaleId,
  type PluginError,
  type ProjectFiles,
  type ProjectPath,
  type Result,
  type SourceDocument,
} from '#plugin-api';

const EXTENSIONS = ['.md', '.mdx'];
const DEFAULT_CONTENT_DIR = 'src/content/docs';
const ASTRO_CONFIGS = [
  'astro.config.mjs',
  'astro.config.ts',
  'astro.config.mts',
  'astro.config.js',
  'astro.config.cjs',
];
const KNOWN_OPTIONS = ['contentDir', 'localeFolders'];

interface Options {
  readonly contentDir: ProjectPath;
  /** Locale id → folder under the content dir; `''` is the root. `undefined`: not configured. */
  readonly localeFolders: Readonly<Record<string, string>> | undefined;
}

const invalid = (reason: string): Result<never, PluginError> =>
  err({ code: 'formats.invalid-options', reason });

/** A folder name under the content dir: empty (the root) or one plain path segment. */
const isFolderName = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[^/\\.][^/\\]*)?$/.test(value);

function parseOptions(options: Readonly<Record<string, unknown>>): Result<Options, PluginError> {
  const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) return invalid(`unknown option(s): ${unknown.join(', ')}`);

  const rawDir = options.contentDir ?? DEFAULT_CONTENT_DIR;
  if (typeof rawDir !== 'string') return invalid('"contentDir" must be a string');
  const contentDir = projectPath(rawDir);
  if (!contentDir.ok) return invalid('"contentDir" must be a folder inside the project');

  const rawFolders = options.localeFolders;
  if (rawFolders === undefined)
    return ok({ contentDir: contentDir.value, localeFolders: undefined });
  if (typeof rawFolders !== 'object' || rawFolders === null || Array.isArray(rawFolders)) {
    return invalid(
      '"localeFolders" must map locale ids to folder names, for example { "en": "", "he": "he" }',
    );
  }
  // Narrow every value instead of casting: entries of an object are `unknown` here.
  const folders: Record<string, string> = {};
  const bad: string[] = [];
  for (const [locale, folder] of Object.entries(rawFolders as Record<string, unknown>)) {
    if (isFolderName(folder)) folders[locale] = folder;
    else bad.push(locale);
  }
  if (bad.length > 0) {
    return invalid(
      `"localeFolders" values must be "" (the root) or a folder name: ${bad.join(', ')}`,
    );
  }
  return ok({ contentDir: contentDir.value, localeFolders: folders });
}

function join(base: ProjectPath, rest: string): Result<ProjectPath, PluginError> {
  if (rest === '') return ok(base);
  const path = projectPath(base === PROJECT_ROOT ? rest : `${base}/${rest}`);
  return path.ok
    ? path
    : err({ code: 'formats.unsupported-project', reason: `invalid path: ${rest}` });
}

/**
 * Starlight names locale folders after their locale keys, usually lowercase (`pt-br`). A folder
 * like that at the content root belongs to another locale, not to the root locale's pages.
 * Only two-letter languages count: three-letter folder names (`api`, `cli`) are usually docs.
 */
const looksLikeLocaleFolder = (name: string) => /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i.test(name);

async function detect(files: ProjectFiles): Promise<Detection> {
  const contentDir = projectPath(DEFAULT_CONTENT_DIR);
  if (!contentDir.ok || !(await files.exists(contentDir.value))) return { matches: false };
  for (const name of ASTRO_CONFIGS) {
    const config = projectPath(name);
    if (!config.ok) continue;
    const text = await files.readText(config.value);
    if (!text.ok) continue;
    return {
      matches: true,
      confidence: text.value.includes('@astrojs/starlight') ? 'certain' : 'likely',
      evidence: [config.value, contentDir.value],
    };
  }
  return { matches: false };
}

async function open(context: FormatContext): Promise<Result<DocumentLayout, PluginError>> {
  const options = parseOptions(context.options);
  if (!options.ok) return options;
  const { contentDir, localeFolders } = options.value;
  if (!(await context.files.exists(contentDir))) {
    return err({ code: 'formats.unsupported-project', reason: `no "${contentDir}" folder` });
  }

  // The source locale's folder: as configured; else its own folder if there is one; else the root.
  let sourceFolderName = localeFolders?.[context.sourceLocale];
  if (sourceFolderName === undefined) {
    const own = join(contentDir, context.sourceLocale.toLowerCase());
    sourceFolderName =
      own.ok && (await context.files.exists(own.value)) ? context.sourceLocale.toLowerCase() : '';
  }
  const sourceFolder = join(contentDir, sourceFolderName);
  if (!sourceFolder.ok) return sourceFolder;

  // At the root, other locales' folders aren't source pages: the configured ones, or else folders
  // named like a locale.
  const otherLocaleFolders = (name: string) =>
    localeFolders === undefined
      ? looksLikeLocaleFolder(name)
      : Object.values(localeFolders).some((folder) => folder !== '' && folder === name);

  return ok(
    createLayout({
      files: context.files,
      contentDir,
      sourceFolder: sourceFolder.value,
      sourceFolderName,
      sourceLocale: context.sourceLocale,
      isOtherLocaleFolder: sourceFolderName === '' ? otherLocaleFolders : () => false,
      folderFor: (locale) =>
        locale === context.sourceLocale
          ? sourceFolderName
          : (localeFolders?.[locale] ?? locale.toLowerCase()),
      declaredLocales: localeFolders === undefined ? [] : Object.keys(localeFolders),
    }),
  );
}

interface LayoutParts {
  readonly files: ProjectFiles;
  readonly contentDir: ProjectPath;
  readonly sourceFolder: ProjectPath;
  readonly sourceFolderName: string;
  readonly sourceLocale: LocaleId;
  readonly isOtherLocaleFolder: (name: string) => boolean;
  readonly folderFor: (locale: LocaleId) => string;
  readonly declaredLocales: readonly string[];
}

function createLayout(parts: LayoutParts): DocumentLayout {
  const { files, contentDir, sourceFolder, sourceFolderName, sourceLocale } = parts;
  const prefix = sourceFolder === PROJECT_ROOT ? '' : `${sourceFolder}/`;
  return {
    declaredLocales: parts.declaredLocales.flatMap((locale) => {
      const id = localeId(locale);
      return id.ok ? [id.value] : [];
    }),

    async listSourceDocuments() {
      const listed = await files.list(sourceFolder, { extensions: EXTENSIONS });
      if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
      const documents: SourceDocument[] = [];
      for (const path of listed.value) {
        const relative = path.slice(prefix.length);
        const [first, ...rest] = relative.split('/');
        if (rest.length > 0 && first !== undefined && parts.isOtherLocaleFolder(first)) continue;
        const key = documentKey(relative.replace(/\.mdx?$/, ''));
        if (!key.ok)
          return err({ code: 'formats.unsupported-project', reason: `bad file name: ${path}` });
        documents.push({ key: key.value, path, locale: sourceLocale });
      }
      return ok(documents);
    },

    targetPathFor(document, target) {
      const folder = parts.folderFor(target);
      if (target !== sourceLocale && folder === sourceFolderName) {
        return err({
          code: 'formats.unsupported-project',
          reason: `"${target}" would share the "${folder === '' ? 'root' : folder}" folder with the source locale`,
        });
      }
      const extension = /\.mdx?$/.exec(document.path)?.[0] ?? '.md';
      const base = join(contentDir, folder);
      if (!base.ok) return base;
      return join(base.value, `${document.key}${extension}`);
    },
  };
}

export const formatStarlight: DocumentFormat = { kind: 'document', detect, open };
