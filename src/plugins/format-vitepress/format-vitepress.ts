// SPDX-License-Identifier: GPL-3.0-or-later
// VitePress sites (https://vitepress.dev): Markdown pages under the source folder (the site's
// folder, the one holding `.vitepress/`, or its `srcDir`), one folder per locale named by its
// `locales` key, with the `root` locale at the top. The config is JavaScript or TypeScript, read
// statically (`findStaticProperties`), never run; folders that can't be read from it follow the
// same conventions as Starlight's, and can be named in paperl10n.config.json.
import {
  documentKey,
  err,
  findStaticProperties,
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
  type ProjectLocale,
  type ProjectPath,
  type Result,
  type SourceDocument,
  type StaticValue,
} from '#plugin-api';

const EXTENSIONS = ['.md'];
/** Where a site's folder usually is: the project itself, or one of these folders in it. */
const SITE_FOLDERS = ['', 'docs', 'doc', 'website', 'site', 'documentation'];
const CONFIG_FILES = ['mts', 'ts', 'mjs', 'js', 'cts', 'cjs'].flatMap((extension) => [
  `.vitepress/config.${extension}`,
  `.vitepress/config/index.${extension}`,
]);
const KNOWN_OPTIONS = ['siteDir', 'srcDir', 'localeFolders'];

interface Options {
  /** The folder holding `.vitepress/`; `undefined`: found by detection's rules. */
  readonly siteDir: ProjectPath | undefined;
  /** The source folder, relative to the site's; `undefined`: the config's `srcDir`, else the site's. */
  readonly srcDir: string | undefined;
  /** Locale id → folder under the source folder; `''` is the root. `undefined`: not configured. */
  readonly localeFolders: Readonly<Record<string, string>> | undefined;
}

const invalid = (reason: string): Result<never, PluginError> =>
  err({ code: 'formats.invalid-options', reason });

/** A folder name under the source folder: empty (the root) or one plain path segment. */
const isFolderName = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[^/\\.][^/\\]*)?$/.test(value);

function parseOptions(options: Readonly<Record<string, unknown>>): Result<Options, PluginError> {
  const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) return invalid(`unknown option(s): ${unknown.join(', ')}`);

  let siteDir: ProjectPath | undefined;
  if (options.siteDir !== undefined) {
    const path = typeof options.siteDir === 'string' ? projectPath(options.siteDir) : null;
    if (path?.ok !== true) return invalid('"siteDir" must be a folder inside the project');
    siteDir = path.value;
  }
  const srcDir = options.srcDir;
  if (srcDir !== undefined && (typeof srcDir !== 'string' || !projectPath(srcDir).ok)) {
    return invalid('"srcDir" must be a folder inside the site');
  }

  const rawFolders = options.localeFolders;
  if (rawFolders === undefined) return ok({ siteDir, srcDir, localeFolders: undefined });
  if (typeof rawFolders !== 'object' || rawFolders === null || Array.isArray(rawFolders)) {
    return invalid(
      '"localeFolders" must map locale ids to folder names, for example { "en": "", "he": "he" }',
    );
  }
  // Narrow every value instead of casting: entries of an object are `unknown` here.
  const folders: Record<string, string> = {};
  const bad: string[] = [];
  for (const [locale, folder] of Object.entries(rawFolders as Record<string, unknown>)) {
    if (isFolderName(folder) && localeId(locale).ok) folders[locale] = folder;
    else bad.push(locale);
  }
  if (bad.length > 0) {
    return invalid(
      `"localeFolders" needs locale ids mapped to "" (the root) or a folder name: ${bad.join(', ')}`,
    );
  }
  return ok({ siteDir, srcDir, localeFolders: folders });
}

function join(base: ProjectPath, rest: string): Result<ProjectPath, PluginError> {
  if (rest === '') return ok(base);
  const path = projectPath(base === PROJECT_ROOT ? rest : `${base}/${rest}`);
  return path.ok
    ? path
    : err({ code: 'formats.unsupported-project', reason: `invalid path: ${rest}` });
}

/**
 * VitePress names locale folders after their `locales` keys, usually lowercase (`pt-br`). A folder
 * like that at the source root belongs to another locale, not to the root locale's pages. Only
 * two-letter languages count: three-letter folder names (`api`, `cli`) are usually docs.
 */
const looksLikeLocaleFolder = (name: string) => /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i.test(name);

/** The site's config file and its text, in `site` (the folder holding `.vitepress/`). */
async function readConfig(
  files: ProjectFiles,
  site: ProjectPath,
): Promise<{ readonly path: ProjectPath; readonly text: string } | undefined> {
  for (const name of CONFIG_FILES) {
    const path = join(site, name);
    if (!path.ok) continue;
    const text = await files.readText(path.value);
    if (text.ok) return { path: path.value, text: text.value };
  }
  return undefined;
}

/** The first site folder (in `SITE_FOLDERS` order) with a VitePress config, and that config. */
async function findSite(files: ProjectFiles) {
  for (const folder of SITE_FOLDERS) {
    const site = folder === '' ? ok(PROJECT_ROOT) : projectPath(folder);
    if (!site.ok) continue;
    const config = await readConfig(files, site.value);
    if (config !== undefined) return { site: site.value, config };
  }
  return undefined;
}

async function detect(files: ProjectFiles): Promise<Detection> {
  const found = await findSite(files);
  if (found === undefined) return { matches: false };
  return {
    matches: true,
    confidence: found.config.text.includes('vitepress') ? 'certain' : 'likely',
    evidence: [found.config.path],
  };
}

/**
 * The property `name` the config sets for the whole site: the shallowest one (VitePress's search
 * options, deeper in, have their own `locales`).
 */
function siteProperty(text: string, name: string): StaticValue | undefined {
  const found = findStaticProperties(text, name);
  const shallowest = Math.min(...found.map(({ depth }) => depth));
  return found.find(({ depth }) => depth === shallowest)?.value;
}

/** A locale and its folder name under the source folder (`''` is the root). */
interface LocaleFolder {
  readonly locale: LocaleId;
  readonly folder: string;
}

/**
 * The config's locales: each key is a folder (`root`: none), whatever its entry holds, and its
 * locale is the entry's `lang` when that's a plain string, else the key. (`root` isn't a locale
 * id, so a `root` without a `lang` names none: the source locale is Paper Lion's own setting.)
 * `undefined` when they can't all be read (`locales` built in code, or a spread among the keys).
 */
function configLocales(text: string): LocaleFolder[] | undefined {
  const locales = siteProperty(text, 'locales');
  if (locales?.kind !== 'object' || !locales.complete) return undefined;
  return [...locales.properties].flatMap(([key, entry]) => {
    const lang = entry.kind === 'object' ? entry.properties.get('lang') : undefined;
    const locale = localeId(lang?.kind === 'string' ? lang.value : key);
    return locale.ok ? [{ locale: locale.value, folder: key === 'root' ? '' : key }] : [];
  });
}

/** Top-level folders under the source folder that hold pages. */
async function foldersWithPages(
  files: ProjectFiles,
  sourceRoot: ProjectPath,
): Promise<Result<string[], PluginError>> {
  const listed = await files.list(sourceRoot, { extensions: EXTENSIONS });
  if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
  const prefix = sourceRoot === PROJECT_ROOT ? '' : `${sourceRoot}/`;
  const folders = new Set<string>();
  for (const path of listed.value) {
    const [first, ...rest] = path.slice(prefix.length).split('/');
    if (first !== undefined && rest.length > 0) folders.add(first);
  }
  return ok([...folders].sort());
}

async function open(context: FormatContext): Promise<Result<DocumentLayout, PluginError>> {
  const options = parseOptions(context.options);
  if (!options.ok) return options;
  const { files, sourceLocale } = context;

  let site = options.value.siteDir;
  let config: { readonly text: string } | undefined;
  if (site === undefined) {
    const found = await findSite(files);
    if (found === undefined) {
      return err({ code: 'formats.unsupported-project', reason: 'no ".vitepress" config found' });
    }
    ({ site, config } = found);
  } else {
    config = await readConfig(files, site);
  }

  // The source folder: the option, else the config's `srcDir` (when it's plain text), else the site.
  const configured = config === undefined ? undefined : siteProperty(config.text, 'srcDir');
  const srcDir =
    options.value.srcDir ?? (configured?.kind === 'string' ? configured.value : undefined);
  const sourceRoot = join(site, srcDir ?? ''); // `./src` and `src/` read as `src`
  if (!sourceRoot.ok) return sourceRoot;
  if (!(await files.exists(sourceRoot.value))) {
    return err({ code: 'formats.unsupported-project', reason: `no "${sourceRoot.value}" folder` });
  }

  const fromOptions = options.value.localeFolders;
  const declared: LocaleFolder[] | undefined =
    fromOptions === undefined
      ? config === undefined
        ? undefined
        : configLocales(config.text)
      : Object.entries(fromOptions).flatMap(([raw, folder]) => {
          const locale = localeId(raw);
          return locale.ok ? [{ locale: locale.value, folder }] : [];
        });
  const existing = await foldersWithPages(files, sourceRoot.value);
  if (!existing.ok) return existing;

  /**
   * A locale's folder, from the most to the least explicit: declared (options or the config); an
   * existing folder with that name, ignoring case (`zh-CN/` for `zh-CN`); the root, for the source
   * locale; else the lowercase convention (`pt-BR` → `pt-br`).
   */
  const folderFor = (locale: LocaleId): string => {
    const fromDeclared = declared?.find((entry) => entry.locale === locale);
    if (fromDeclared !== undefined) return fromDeclared.folder;
    const onDisk = existing.value.find((name) => {
      const asLocale = localeId(name);
      return asLocale.ok && asLocale.value === locale;
    });
    if (onDisk !== undefined) return onDisk;
    return locale === sourceLocale ? '' : locale.toLowerCase();
  };
  const sourceFolderName = folderFor(sourceLocale);
  const sourceFolder = join(sourceRoot.value, sourceFolderName);
  if (!sourceFolder.ok) return sourceFolder;

  // The project's locales: the source first, then the declared ones; without a declaration, the
  // existing folders named like a locale.
  const candidates: LocaleFolder[] =
    declared ??
    existing.value.flatMap((name) => {
      const locale = localeId(name);
      return locale.ok && looksLikeLocaleFolder(name)
        ? [{ locale: locale.value, folder: name }]
        : [];
    });
  const locales: ProjectLocale[] = [];
  for (const { locale, folder } of [
    { locale: sourceLocale, folder: sourceFolderName },
    ...candidates,
  ]) {
    const path = join(sourceRoot.value, folder);
    if (path.ok && !locales.some((entry) => entry.locale === locale)) {
      locales.push({ locale, folder: path.value });
    }
  }

  // At the root, other locales' folders aren't source pages: the declared ones, or else folders
  // named like a locale.
  const otherLocaleFolder = (name: string) =>
    declared === undefined
      ? looksLikeLocaleFolder(name)
      : declared.some((entry) => entry.folder !== '' && entry.folder === name);

  return ok(
    createLayout({
      files,
      sourceRoot: sourceRoot.value,
      sourceFolder: sourceFolder.value,
      sourceFolderName,
      sourceLocale,
      // `public/` is static files at the source root only, as other locales' folders are.
      isOtherFolder:
        sourceFolderName === ''
          ? (name) => name === 'public' || otherLocaleFolder(name)
          : () => false,
      folderFor,
      locales,
    }),
  );
}

interface LayoutParts {
  readonly files: ProjectFiles;
  readonly sourceRoot: ProjectPath;
  readonly sourceFolder: ProjectPath;
  readonly sourceFolderName: string;
  readonly sourceLocale: LocaleId;
  /** A top-level folder of the source folder that isn't its pages (another locale's, `public/`). */
  readonly isOtherFolder: (name: string) => boolean;
  readonly folderFor: (locale: LocaleId) => string;
  readonly locales: readonly ProjectLocale[];
}

function createLayout(parts: LayoutParts): DocumentLayout {
  const { files, sourceRoot, sourceFolder, sourceFolderName, sourceLocale } = parts;
  const prefix = sourceFolder === PROJECT_ROOT ? '' : `${sourceFolder}/`;
  return {
    locales: parts.locales,

    async listSourceDocuments() {
      const listed = await files.list(sourceFolder, { extensions: EXTENSIONS });
      if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
      const documents: SourceDocument[] = [];
      for (const path of listed.value) {
        const relative = path.slice(prefix.length);
        const segments = relative.split('/');
        const [first] = segments;
        // Not pages: dot-folders (`.vitepress/`, `.github/`), static files, other locales.
        if (segments.slice(0, -1).some((segment) => segment.startsWith('.'))) continue;
        if (segments.length > 1 && parts.isOtherFolder(first ?? '')) continue;
        const key = documentKey(relative.replace(/\.md$/, ''));
        if (!key.ok)
          return err({ code: 'formats.unsupported-project', reason: `bad file name: ${path}` });
        documents.push({ key: key.value, path, locale: sourceLocale });
      }
      return ok(documents);
    },

    // VitePress serves a locale's pages under its folder's name (`/he/guide/`), and the root
    // locale's at the root. A link's first path segment naming the translation's folder becomes
    // the source's. Relative links and other sites' URLs are left as written, and so is a site
    // `base`; `.md` and `.html` suffixes are kept as they are.
    sourceLinkTarget(target, locale) {
      const folder = parts.folderFor(locale);
      if (folder === '') return target; // (the source's own folder maps to itself)
      const first = /^\/([^/?#]+)/.exec(target);
      if (first?.[1]?.toLowerCase() !== folder.toLowerCase()) return target;
      const rest = target.slice(first[0].length);
      const path = rest.startsWith('/') ? rest : `/${rest}`;
      return sourceFolderName === '' ? path : `/${sourceFolderName}${path}`;
    },

    targetPathFor(document, target) {
      const folder = parts.folderFor(target);
      if (target !== sourceLocale && folder === sourceFolderName) {
        return err({
          code: 'formats.unsupported-project',
          reason: `"${target}" would share the "${folder === '' ? 'root' : folder}" folder with the source locale`,
        });
      }
      const base = join(sourceRoot, folder);
      if (!base.ok) return base;
      return join(base.value, `${document.key}.md`);
    },
  };
}

export const formatVitepress: DocumentFormat = { kind: 'document', detect, open };
