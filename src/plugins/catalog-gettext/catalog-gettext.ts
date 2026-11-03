// SPDX-License-Identifier: GPL-3.0-or-later
// gettext catalogs (https://www.gnu.org/software/gettext/): PO files, one per locale, made from a
// template (POT). Two layouts: side by side (`po/myapp.pot`, `po/he.po`) and a folder per locale
// (`locale/he/LC_MESSAGES/django.po`). A catalog is a domain (the file's base name). A message's
// key is its `msgid` (after its `msgctxt`, if any): in gettext, the source text is the key.
import {
  catalogKey,
  err,
  messageKey,
  ok,
  PROJECT_ROOT,
  projectPath,
  type CatalogEdit,
  type CatalogFileRole,
  type CatalogFormat,
  type CatalogLayout,
  type Detection,
  type FormatContext,
  type LocaleId,
  type Message,
  type ParsedCatalog,
  type PlaceholderToken,
  type PluginError,
  type PluralForm,
  type ProjectFiles,
  type ProjectPath,
  type Result,
  type SourceCatalog,
} from '#plugin-api';
import { gettextName, localeFromGettext } from './gettext-locale.ts';
import { scanGettext } from './gettext-syntax.ts';
import { parsePluralForms, pluralSamples, type PluralRule } from './plural-formula.ts';
import pluralTable from './plural-forms.json' with { type: 'json' };
import { headerField, headerOf, readPo, type PoFile } from './po-file.ts';
import { entryKey, newPo, patchPo, type PoChange } from './po-write.ts';

const EXTENSIONS = ['.po', '.pot'];
const KNOWN_OPTIONS = ['dirs'];
/** Folders that hold a folder per locale even before any translation exists (Django, Sphinx). */
const PER_LOCALE_FOLDERS = ['locale', 'locales'];
/** msginit's default for a language gettext knows no rule for. */
const DEFAULT_PLURAL_FORMS = 'nplurals=2; plural=n != 1;';

const invalid = (reason: string): Result<never, PluginError> =>
  err({ code: 'formats.invalid-options', reason });

const malformed = (reason: string): Result<never, PluginError> =>
  err({ code: 'formats.invalid-catalog', reason });

function parseOptions(
  options: Readonly<Record<string, unknown>>,
): Result<readonly ProjectPath[], PluginError> {
  const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) return invalid(`unknown option(s): ${unknown.join(', ')}`);
  const dirs = options.dirs;
  if (dirs === undefined) return ok([PROJECT_ROOT]);
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return invalid('"dirs" must list folders inside the project');
  }
  const paths: ProjectPath[] = [];
  for (const dir of dirs as unknown[]) {
    const path = typeof dir === 'string' ? projectPath(dir) : null;
    if (path?.ok !== true) return invalid('"dirs" must list folders inside the project');
    paths.push(path.value);
  }
  return ok(paths);
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.pot?$/, '');
const join = (folder: string, rest: string) => (folder === '' ? rest : `${folder}/${rest}`);

/** A project's PO and POT files, sorted. */
async function poFiles(
  files: ProjectFiles,
  dirs: readonly ProjectPath[],
): Promise<Result<string[], PluginError>> {
  const found = new Set<string>();
  for (const dir of dirs) {
    const listed = await files.list(dir, { extensions: EXTENSIONS });
    if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
    for (const path of listed.value) found.add(path);
  }
  return ok([...found].sort());
}

async function detect(files: ProjectFiles): Promise<Detection> {
  const found = await poFiles(files, [PROJECT_ROOT]);
  if (!found.ok || found.value.length === 0) return { matches: false };
  const certain = found.value.some(
    (path) => path.endsWith('.pot') || path.includes('/LC_MESSAGES/'),
  );
  const evidence = found.value.slice(0, 3).flatMap((path) => {
    const parsed = projectPath(path);
    return parsed.ok ? [parsed.value] : [];
  });
  return { matches: true, confidence: certain ? 'certain' : 'likely', evidence };
}

/** One catalog as the layout found it. */
interface FoundCatalog {
  readonly domain: string;
  /** The template, or the source locale's file. */
  readonly source: string;
  /** Where a locale's file goes, by gettext name. */
  readonly pathFor: (name: string) => string;
  /** The gettext names of the locales it has files for. */
  readonly names: readonly string[];
}

/** The catalogs in `paths`, in a stable order. */
function findCatalogs(paths: readonly string[], sourceLocale: LocaleId): FoundCatalog[] {
  const templates = paths.filter((path) => path.endsWith('.pot'));
  const isSource = (name: string) => localeFromGettext(name) === sourceLocale;
  const catalogs: FoundCatalog[] = [];
  const claimed = new Set<string>();

  // A folder per locale: `<base>/<locale>/LC_MESSAGES/<domain>.po`, grouped by base and domain.
  const perLocale = new Map<string, { base: string; domain: string; names: Set<string> }>();
  for (const path of paths) {
    const match = /^(?:(.*)\/)?([^/]+)\/LC_MESSAGES\/([^/]+)\.po$/.exec(path);
    if (match === null || localeFromGettext(match[2] ?? '') === undefined) continue;
    const [, base = '', name = '', domain = ''] = match;
    const id = `${base}\n${domain}`;
    const group = perLocale.get(id) ?? { base, domain, names: new Set<string>() };
    group.names.add(name);
    perLocale.set(id, group);
  }
  // A template in a `locale/` folder with no translations yet starts one.
  for (const template of templates) {
    const base = folderOf(template);
    const domain = baseName(template);
    const id = `${base}\n${domain}`;
    if (PER_LOCALE_FOLDERS.includes(baseName(base)) && !perLocale.has(id)) {
      perLocale.set(id, { base, domain, names: new Set() });
    }
  }
  for (const { base, domain, names } of perLocale.values()) {
    const pathFor = (name: string) => join(base, `${name}/LC_MESSAGES/${domain}.po`);
    // The template next to the folders, else the only one with that domain anywhere (Sphinx keeps
    // its templates in a build folder), else the source locale's own file.
    const sameDomain = templates.filter((template) => baseName(template) === domain);
    const template = sameDomain.includes(join(base, `${domain}.pot`))
      ? join(base, `${domain}.pot`)
      : sameDomain.length === 1
        ? sameDomain[0]
        : undefined;
    const sourceName = [...names].find(isSource);
    const source = template ?? (sourceName === undefined ? undefined : pathFor(sourceName));
    if (source === undefined) continue;
    if (template !== undefined) claimed.add(template);
    catalogs.push({ domain, source, pathFor, names: [...names].sort() });
  }

  // Side by side: `<dir>/<locale>.po` next to `<dir>/<domain>.pot`. One domain per folder: its
  // template, or the folder's name without one.
  const sideBySide = new Map<string, Set<string>>();
  for (const path of paths) {
    if (!path.endsWith('.po') || /\/LC_MESSAGES\//.test(path)) continue;
    // A name that isn't a locale (`messages.po`) is left out wherever names are read.
    const dir = folderOf(path);
    sideBySide.set(dir, (sideBySide.get(dir) ?? new Set()).add(baseName(path)));
  }
  for (const template of templates) {
    const dir = folderOf(template);
    if (!claimed.has(template) && !perLocale.has(`${dir}\n${baseName(template)}`)) {
      sideBySide.set(dir, sideBySide.get(dir) ?? new Set());
    }
  }
  for (const [dir, names] of sideBySide) {
    const template = templates.find((path) => folderOf(path) === dir && !claimed.has(path));
    const pathFor = (name: string) => join(dir, `${name}.po`);
    const sourceName = [...names].find(isSource);
    const source = template ?? (sourceName === undefined ? undefined : pathFor(sourceName));
    if (source === undefined) continue;
    const domain =
      template === undefined ? baseName(dir === '' ? 'messages' : dir) : baseName(template);
    catalogs.push({ domain, source, pathFor, names: [...names].sort() });
  }
  return catalogs.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
}

async function open(context: FormatContext): Promise<Result<CatalogLayout, PluginError>> {
  const dirs = parseOptions(context.options);
  if (!dirs.ok) return dirs;
  const found = await poFiles(context.files, dirs.value);
  if (!found.ok) return found;
  const sourceLocale = context.sourceLocale;
  const raw = findCatalogs(found.value, sourceLocale);

  // A catalog's key is its domain; two with one domain are told apart by their source's folder.
  const domains = raw.map((catalog) => catalog.domain);
  const catalogs: { readonly catalog: SourceCatalog; readonly found: FoundCatalog }[] = [];
  for (const entry of raw) {
    const shared = domains.filter((domain) => domain === entry.domain).length > 1;
    const key = catalogKey(shared ? join(folderOf(entry.source), entry.domain) : entry.domain);
    const path = projectPath(entry.source);
    if (!key.ok || !path.ok) {
      return err({ code: 'formats.unsupported-project', reason: `bad catalog: ${entry.source}` });
    }
    catalogs.push({
      catalog: { key: key.value, path: path.value, locale: sourceLocale },
      found: entry,
    });
  }

  const locales = new Set<LocaleId>([sourceLocale]);
  for (const name of [...new Set(raw.flatMap((catalog) => catalog.names))].sort()) {
    const locale = localeFromGettext(name);
    if (locale !== undefined) locales.add(locale);
  }

  return ok({
    locales: [...locales],
    listCatalogs: () => Promise.resolve(ok(catalogs.map(({ catalog }) => catalog))),
    targetPathFor(catalog, locale) {
      const entry = catalogs.find((candidate) => candidate.catalog.key === catalog.key);
      if (entry === undefined) {
        return err({
          code: 'formats.unsupported-project',
          reason: `unknown catalog: ${catalog.key}`,
        });
      }
      if (locale === sourceLocale) return ok(entry.catalog.path);
      // The file's existing name for this locale (`pt_BR`, or `pt-br`), else gettext's own.
      const name =
        entry.found.names.find((existing) => localeFromGettext(existing) === locale) ??
        gettextName(locale);
      const path = projectPath(entry.found.pathFor(name));
      return path.ok
        ? path
        : err({ code: 'formats.unsupported-project', reason: `bad path for ${locale}` });
    },
  });
}

/** A PO file's text read, with its charset checked (Paper Lion reads UTF-8 only). */
function readFile(text: string): Result<PoFile, PluginError> {
  const read = readPo(text);
  if (!read.ok) return malformed(read.reason);
  const contentType = headerField(headerOf(read.file), 'Content-Type') ?? '';
  const charset = /charset=([^;\s]+)/i.exec(contentType)?.[1];
  if (charset !== undefined && !/^(?:utf-8|utf8|charset)$/i.test(charset)) {
    return malformed(`the file says it's ${charset}, and only UTF-8 is supported`);
  }
  return ok(read.file);
}

function parse(text: string, role: CatalogFileRole): Result<ParsedCatalog, PluginError> {
  const file = readFile(text);
  if (!file.ok) return file;
  const header = headerOf(file.value);
  const messages: Message[] = [];
  const keys = new Set<string>();
  for (const entry of file.value.entries) {
    if (entry.obsolete || entry === header) continue;
    const key = messageKey(entryKey(entry));
    if (!key.ok) return malformed('an entry without a msgid');
    if (keys.has(key.value))
      return malformed(`a duplicate entry: ${JSON.stringify(entryKey(entry))}`);
    keys.add(key.value);
    // A source's text is its msgid (a template's msgstr is empty); a translation's is its msgstr.
    const forms =
      role === 'source'
        ? entry.msgidPlural === undefined
          ? undefined
          : [entry.msgid, entry.msgidPlural]
        : entry.msgidPlural === undefined
          ? undefined
          : entry.msgstr;
    const flags = entry.flags.filter((flag) => flag !== 'fuzzy');
    const fuzzy = role !== 'source' && entry.flags.includes('fuzzy');
    messages.push({
      key: key.value,
      text: forms?.[0] ?? (role === 'source' ? entry.msgid : (entry.msgstr[0] ?? '')),
      ...(forms === undefined ? {} : { forms }),
      ...(entry.extractedComments.length === 0
        ? {}
        : { documentation: entry.extractedComments.join('\n') }),
      ...(fuzzy ? { needsReview: true } : {}),
      ...(fuzzy && entry.previousMsgid !== undefined
        ? { previousSource: entry.previousMsgid }
        : {}),
      ...(flags.length === 0 ? {} : { flags }),
    });
  }
  return ok({ text, messages });
}

/** The plural rule of `locale`: its file's `Plural-Forms`, else CLDR's, else gettext's default. */
function pluralRule(locale: LocaleId, target: PoFile | null): PluralRule {
  const declared = headerField(target === null ? undefined : headerOf(target), 'Plural-Forms');
  const fromFile = declared === undefined ? null : parsePluralForms(declared);
  if (fromFile !== null) return fromFile;
  const languages: Readonly<Record<string, { plurals: number; formula: string }>> =
    pluralTable.languages;
  const name = gettextName(locale).replace(/@.*/, '');
  const known =
    Object.entries(languages).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ??
    languages[name.split('_')[0] ?? ''];
  const rule =
    known === undefined
      ? null
      : parsePluralForms(`nplurals=${String(known.plurals)}; plural=${known.formula};`);
  return rule ?? (parsePluralForms(DEFAULT_PLURAL_FORMS) as PluralRule);
}

function pluralForms(locale: LocaleId, target: ParsedCatalog | null): readonly PluralForm[] {
  const file = target === null ? null : readFile(target.text);
  return pluralSamples(pluralRule(locale, file?.ok === true ? file.value : null)).map(
    (samples) => ({ samples }),
  );
}

function serialize(edit: CatalogEdit): Result<string, PluginError> {
  const source = readFile(edit.source.text);
  if (!source.ok) return source;
  const target = edit.target === null ? null : readFile(edit.target.text);
  if (target !== null && !target.ok) return target;
  const rule = pluralRule(edit.locale, target?.value ?? null);
  const changes: PoChange[] = edit.changes.map((change) =>
    change.kind === 'set'
      ? { kind: 'set', key: change.key, forms: change.forms ?? [change.text] }
      : change,
  );
  if (target === null) {
    const header = `nplurals=${String(rule.count)}; plural=${rule.expression};`;
    return ok(newPo(source.value, gettextName(edit.locale), header, rule.count, changes));
  }
  return ok(patchPo(target.value, source.value, changes, rule.count));
}

function scan(text: string, message?: Message): readonly PlaceholderToken[] {
  return scanGettext(text, message?.flags ?? []);
}

export const catalogGettext: CatalogFormat = {
  kind: 'catalog',
  detect,
  open,
  parse,
  serialize,
  placeholders: { scan },
  pluralForms,
};
