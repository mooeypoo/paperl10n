// SPDX-License-Identifier: GPL-3.0-or-later
// banana-i18n catalogs (MediaWiki extensions and skins, jQuery.i18n apps): a messages folder per
// catalog, with one JSON file per locale (`en.json`, `he.json`, `pt-br.json`) and `qqq.json`
// documenting each message. See README.md.
import {
  catalogKey,
  err,
  localeId,
  ok,
  PROJECT_ROOT,
  projectPath,
  type CatalogFormat,
  type CatalogKey,
  type CatalogLayout,
  type Detection,
  type LocaleId,
  type PluginError,
  type ProjectFiles,
  type ProjectPath,
  type Result,
  type SourceCatalog,
} from '#plugin-api';
import { parseBananaJson, serializeBananaJson } from './banana-json.ts';
import { scanBanana } from './banana-syntax.ts';

const EXTENSION = '.json';
const DOCUMENTATION = 'qqq';
/** MediaWiki's manifests, which list an extension's (or skin's) messages folders. */
const MANIFESTS = ['extension.json', 'skin.json'] as const;
/** The key of a catalog whose files are at the project's root. */
const ROOT_KEY = '.';

/** A folder's JSON files, by name without `.json`, lowercased. */
type FolderFiles = ReadonlyMap<string, ProjectPath>;

function folderOf(path: ProjectPath): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function nameOf(path: ProjectPath): string {
  return path.slice(path.lastIndexOf('/') + 1, -EXTENSION.length);
}

/** Each folder's JSON files, from one listing of the project. */
async function jsonFolders(
  files: ProjectFiles,
): Promise<Result<ReadonlyMap<string, FolderFiles>, PluginError>> {
  const listed = await files.list(PROJECT_ROOT, { extensions: [EXTENSION] });
  if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
  const folders = new Map<string, Map<string, ProjectPath>>();
  for (const path of listed.value) {
    const folder = folderOf(path);
    const names = folders.get(folder) ?? new Map<string, ProjectPath>();
    names.set(nameOf(path).toLowerCase(), path);
    folders.set(folder, names);
  }
  return ok(folders);
}

/** Does this file look like a banana-i18n file: an object with `@metadata`? */
async function hasMetadata(files: ProjectFiles, path: ProjectPath): Promise<boolean> {
  const text = await files.readText(path);
  if (!text.ok) return false;
  try {
    const value: unknown = JSON.parse(text.value.replace(/^\uFEFF/, ''));
    return typeof value === 'object' && value !== null && '@metadata' in value;
  } catch {
    return false;
  }
}

/** A messages folder's path, written in a manifest or the options: `./i18n/` → `i18n`. */
function normalizeFolder(raw: string): Result<string, PluginError> {
  const path = projectPath(raw);
  return path.ok
    ? ok(path.value)
    : err({ code: 'formats.unsupported-project', reason: `not a folder in the project: ${raw}` });
}

/** The messages folders MediaWiki's `extension.json` or `skin.json` lists, if it has any. */
async function manifestFolders(
  files: ProjectFiles,
): Promise<{ readonly manifest: ProjectPath; readonly folders: readonly string[] } | undefined> {
  for (const name of MANIFESTS) {
    const manifest = projectPath(name);
    if (!manifest.ok || !(await files.exists(manifest.value))) continue;
    const text = await files.readText(manifest.value);
    if (!text.ok) continue;
    let messagesDirs: unknown;
    try {
      messagesDirs = (JSON.parse(text.value.replace(/^\uFEFF/, '')) as Record<string, unknown>)
        .MessagesDirs;
    } catch {
      continue;
    }
    if (typeof messagesDirs !== 'object' || messagesDirs === null) continue;
    const folders: string[] = [];
    for (const value of Object.values(messagesDirs)) {
      for (const raw of Array.isArray(value) ? (value as unknown[]) : [value]) {
        const folder = typeof raw === 'string' ? normalizeFolder(raw) : undefined;
        if (folder?.ok && !folders.includes(folder.value)) folders.push(folder.value);
      }
    }
    if (folders.length > 0) return { manifest: manifest.value, folders };
  }
  return undefined;
}

/** Folders that look like messages folders: with a `qqq.json`, or a locale's file with `@metadata`. */
async function scannedFolders(
  files: ProjectFiles,
  folders: ReadonlyMap<string, FolderFiles>,
  sourceLocale?: LocaleId,
): Promise<{ readonly folder: string; readonly evidence: ProjectPath }[]> {
  const found: { folder: string; evidence: ProjectPath }[] = [];
  for (const [folder, names] of folders) {
    const documentation = names.get(DOCUMENTATION);
    const candidate =
      sourceLocale === undefined
        ? [...names].find(([name]) => name !== DOCUMENTATION && localeId(name).ok)?.[1]
        : names.get(sourceLocale.toLowerCase());
    if (candidate === undefined) continue;
    if (documentation !== undefined) found.push({ folder, evidence: documentation });
    else if (await hasMetadata(files, candidate)) found.push({ folder, evidence: candidate });
  }
  return found;
}

async function detect(files: ProjectFiles): Promise<Detection> {
  const manifest = await manifestFolders(files);
  if (manifest !== undefined) {
    return { matches: true, confidence: 'certain', evidence: [manifest.manifest] };
  }
  const folders = await jsonFolders(files);
  if (!folders.ok) return { matches: false };
  const scanned = await scannedFolders(files, folders.value);
  return scanned.length === 0
    ? { matches: false }
    : { matches: true, confidence: 'likely', evidence: scanned.map((s) => s.evidence) };
}

/** The `dirs` option, when given: the messages folders, overriding the manifest and the scan. */
function readOptions(
  options: Readonly<Record<string, unknown>>,
): Result<readonly string[] | undefined, PluginError> {
  const invalid = (reason: string) => err({ code: 'formats.invalid-options' as const, reason });
  const unknown = Object.keys(options).filter((key) => key !== 'dirs');
  if (unknown.length > 0) return invalid(`unknown options: ${unknown.join(', ')}`);
  const { dirs } = options;
  if (dirs === undefined) return ok(undefined);
  if (!Array.isArray(dirs) || dirs.length === 0 || !dirs.every((d) => typeof d === 'string')) {
    return invalid('"dirs" must be a non-empty list of folders');
  }
  const folders: string[] = [];
  for (const raw of dirs) {
    const folder = normalizeFolder(raw);
    if (!folder.ok) return invalid(`"dirs": not a folder in the project: ${raw}`);
    if (!folders.includes(folder.value)) folders.push(folder.value);
  }
  return ok(folders);
}

/** What the layout knows about one catalog. */
interface CatalogFolder {
  readonly folder: string;
  readonly files: FolderFiles;
}

/** Where a locale's file goes: an existing file whatever its case, else named like the folder's
 * files (lowercase, as MediaWiki writes them, unless the folder's names keep case). */
function fileFor(catalog: CatalogFolder, locale: LocaleId): Result<ProjectPath, PluginError> {
  const existing = catalog.files.get(locale.toLowerCase());
  if (existing !== undefined) return ok(existing);
  const keepsCase = [...catalog.files.values()].some((path) => /[A-Z]/.test(nameOf(path)));
  const name = `${keepsCase ? locale : locale.toLowerCase()}${EXTENSION}`;
  const path = projectPath(catalog.folder === '' ? name : `${catalog.folder}/${name}`);
  return path.ok ? path : err({ code: 'formats.unsupported-project', reason: 'bad path' });
}

export const catalogBanana: CatalogFormat = {
  kind: 'catalog',
  detect,

  async open(context) {
    const pinned = readOptions(context.options);
    if (!pinned.ok) return pinned;
    const folders = await jsonFolders(context.files);
    if (!folders.ok) return folders;
    const { sourceLocale } = context;
    const sourceName = sourceLocale.toLowerCase();

    let chosen: readonly string[];
    if (pinned.value !== undefined) {
      const missing = pinned.value.find((f) => folders.value.get(f)?.get(sourceName) === undefined);
      if (missing !== undefined) {
        return err({
          code: 'formats.unsupported-project',
          reason: `"${missing || ROOT_KEY}" has no ${sourceName}${EXTENSION}`,
        });
      }
      chosen = pinned.value;
    } else {
      const manifest = await manifestFolders(context.files);
      chosen =
        manifest?.folders ??
        (await scannedFolders(context.files, folders.value, sourceLocale)).map((s) => s.folder);
    }

    const byKey = new Map<CatalogKey, CatalogFolder>();
    const catalogs: SourceCatalog[] = [];
    const locales = new Set<LocaleId>([sourceLocale]);
    for (const folder of chosen) {
      const files = folders.value.get(folder);
      const path = files?.get(sourceName);
      const key = catalogKey(folder === '' ? ROOT_KEY : folder);
      // A folder the manifest lists without the source's file has nothing to translate.
      if (files === undefined || path === undefined || !key.ok) continue;
      byKey.set(key.value, { folder, files });
      const documentation = files.get(DOCUMENTATION);
      catalogs.push({
        key: key.value,
        path,
        locale: sourceLocale,
        ...(documentation === undefined ? {} : { documentation }),
      });
      for (const name of files.keys()) {
        const locale = localeId(name);
        if (name !== DOCUMENTATION && locale.ok) locales.add(locale.value);
      }
    }

    const layout: CatalogLayout = {
      locales: [...locales],
      listCatalogs: () => Promise.resolve(ok(catalogs)),
      targetPathFor: (catalog, locale) => {
        const known = byKey.get(catalog.key);
        if (known === undefined) {
          return err({
            code: 'formats.unsupported-project',
            reason: `no catalog "${catalog.key}"`,
          });
        }
        return fileFor(known, locale);
      },
    };
    return ok(layout);
  },

  parse: parseBananaJson,
  serialize: serializeBananaJson,
  placeholders: { scan: scanBanana },
};
