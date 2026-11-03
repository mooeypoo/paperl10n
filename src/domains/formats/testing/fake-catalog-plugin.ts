// SPDX-License-Identifier: GPL-3.0-or-later
import {
  catalogKey,
  messageKey,
  type Message,
  type MessageKey,
  type PlaceholderToken,
} from '#domains/catalog';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { PROJECT_ROOT, projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { Detection } from '../domain/detection.ts';
import type {
  CatalogEdit,
  CatalogFileRole,
  CatalogFormat,
  CatalogLayout,
  ParsedCatalog,
  PluralForm,
  SourceCatalog,
} from '../application/ports/catalog-format.ts';
import type { PluginError } from '../application/ports/plugin-error.ts';
import type { PluginModule } from '../application/ports/plugin-module.ts';
import { fakeManifest } from './fake-plugins.ts';

// A catalog plugin for tests, with a deliberately simple file format so that it's obviously
// right: one `key=value` line per message, in `<folder>/<locale>.cat`, with `qqq.cat` as the
// documentation. Values escape `\`, `|`, and line breaks (`\\`, `\|`, `\n`, `\r`). A message
// with plural forms is `key[]=one|other` (every locale has those two forms), and one whose
// translation needs review starts with `?` (`?key=value`), maybe with the source it was made for
// in parentheses (`?(Hi)key=value`); setting it drops both. A file may say which file of its
// catalog it is (`# role: source`), and then reads as malformed in another role, so tests can
// see that each file is read as what it is. Lines starting with `#`, and blank lines, aren't
// messages and are kept as they are.

const EXTENSION = '.cat';
const DOCUMENTATION = 'qqq';
const ROOT_KEY = '.';

interface Line {
  /** The line as written, without its line break. */
  readonly content: string;
  readonly lineBreak: string;
  readonly message?: Message;
}

/** The plural forms of every locale here: "one" and "other". */
const PLURAL_FORMS: readonly PluralForm[] = [{ samples: [1] }, { samples: [0, 2, 3, 4, 5] }];

/** A value as written: `\\` and line breaks escaped, and `|` too in a plural form. */
function escapeValue(text: string, form: boolean): string {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return form ? escaped.replace(/\|/g, '\\|') : escaped;
}

/** A value's texts: the value, or (`forms`) each plural form, split at each unescaped `|`. */
function unescapeValues(raw: string, forms: boolean): string[] {
  const values: string[] = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i] ?? '';
    const next = raw[i + 1] ?? '';
    if (
      char === '\\' &&
      (next === '\\' || next === 'n' || next === 'r' || (forms && next === '|'))
    ) {
      current += next === 'n' ? '\n' : next === 'r' ? '\r' : next;
      i++;
    } else if (forms && char === '|') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  return [...values, current];
}

/** A message's line, without its line break. */
function contentOf(key: MessageKey, text: string, forms: readonly string[] | undefined): string {
  return forms === undefined
    ? `${key}=${escapeValue(text, false)}`
    : `${key}[]=${forms.map((form) => escapeValue(form, true)).join('|')}`;
}

function splitLines(text: string): Result<Line[], PluginError> {
  const lines: Line[] = [];
  const keys = new Set<string>();
  for (const match of text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    const [, content = '', lineBreak = ''] = match;
    if (content === '' && lineBreak === '') break;
    if (content.trim() === '' || content.startsWith('#')) {
      lines.push({ content, lineBreak });
      continue;
    }
    const review = /^\?(?:\(([^)]*)\))?/.exec(content);
    const needsReview = review !== null;
    const previousSource = review?.[1];
    const line = content.slice(review?.[0].length ?? 0);
    const equals = line.indexOf('=');
    const name = equals < 0 ? '' : line.slice(0, equals);
    const plural = name.endsWith('[]');
    const key = messageKey(plural ? name.slice(0, -2) : name);
    if (!key.ok)
      return err({ code: 'formats.invalid-catalog', reason: `not a message: ${content}` });
    if (keys.has(key.value)) {
      return err({ code: 'formats.invalid-catalog', reason: `duplicate key: ${key.value}` });
    }
    keys.add(key.value);
    const raw = line.slice(equals + 1);
    const forms = plural ? unescapeValues(raw, true) : undefined;
    const message: Message = {
      key: key.value,
      text: (forms ?? unescapeValues(raw, false))[0] ?? '',
      ...(forms === undefined ? {} : { forms }),
      ...(needsReview ? { needsReview } : {}),
      ...(previousSource === undefined ? {} : { previousSource }),
    };
    lines.push({ content, lineBreak, message });
  }
  return ok(lines);
}

function parse(text: string, role: CatalogFileRole): Result<ParsedCatalog, PluginError> {
  const declared = /^# role: (\S+)$/m.exec(text)?.[1];
  if (declared !== undefined && declared !== role) {
    return err({ code: 'formats.invalid-catalog', reason: `a ${declared} file read as ${role}` });
  }
  const lines = splitLines(text);
  if (!lines.ok) return lines;
  return ok({ text, messages: lines.value.flatMap((line) => line.message ?? []) });
}

function serialize(edit: CatalogEdit): Result<string, PluginError> {
  const parsed = splitLines(edit.target?.text ?? '');
  if (!parsed.ok) return parsed;
  const lines = parsed.value;
  const lineBreak = lines.find((line) => line.lineBreak !== '')?.lineBreak ?? '\n';
  const sourceOrder = edit.source.messages.map((message) => message.key);
  const indexOf = (key: MessageKey) => lines.findIndex((line) => line.message?.key === key);
  const lineFor = (key: MessageKey, text: string, forms?: readonly string[]): Line => ({
    content: contentOf(key, text, forms),
    lineBreak,
    message: { key, text, ...(forms === undefined ? {} : { forms }) },
  });
  const sameForms = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
    JSON.stringify(a) === JSON.stringify(b);

  for (const change of edit.changes) {
    const at = indexOf(change.key);
    if (change.kind === 'remove') {
      if (at >= 0) lines.splice(at, 1);
    } else if (at >= 0) {
      const current = lines[at];
      const unchanged =
        current?.message?.text === change.text &&
        sameForms(current.message.forms, change.forms) &&
        current.message.needsReview !== true;
      if (current !== undefined && !unchanged) {
        lines[at] = {
          ...lineFor(change.key, change.text, change.forms),
          lineBreak: current.lineBreak,
        };
      }
    } else {
      // After the nearest message before it in the source that this file has; else first.
      const before = sourceOrder.slice(0, Math.max(0, sourceOrder.indexOf(change.key)));
      const previous = before
        .reverse()
        .map(indexOf)
        .find((index) => index >= 0);
      const firstMessage = lines.findIndex((line) => line.message !== undefined);
      const insertAt =
        previous !== undefined ? previous + 1 : firstMessage >= 0 ? firstMessage : lines.length;
      const line = lineFor(change.key, change.text, change.forms);
      // After a last line without a line break, the new line becomes the last one instead.
      const prior = lines[insertAt - 1];
      if (prior !== undefined && prior.lineBreak === '') {
        lines[insertAt - 1] = { ...prior, lineBreak };
        lines.splice(insertAt, 0, { ...line, lineBreak: '' });
      } else {
        lines.splice(insertAt, 0, line);
      }
    }
  }
  return ok(lines.map((line) => line.content + line.lineBreak).join(''));
}

const PATTERNS: readonly [RegExp, (match: RegExpMatchArray) => PlaceholderToken | undefined][] = [
  [
    /\{\{(PLURAL|GENDER):([^|{}]*)\|[^{}]*\}\}/g,
    (m) => {
      const [text = '', kind, parameter = ''] = m;
      const span = { text, start: m.index ?? 0, end: (m.index ?? 0) + text.length };
      return kind === 'PLURAL'
        ? { ...span, kind: 'plural', parameter }
        : { ...span, kind: 'gender', parameter };
    },
  ],
  [
    /\{\{[^{}]+\}\}/g,
    (m) => {
      const [text = ''] = m;
      if (/^\{\{(PLURAL|GENDER):/.test(text)) return undefined;
      return { kind: 'other', text, start: m.index ?? 0, end: (m.index ?? 0) + text.length };
    },
  ],
  [
    /\$\d+/g,
    (m) => {
      const [text = ''] = m;
      return { kind: 'parameter', text, start: m.index ?? 0, end: (m.index ?? 0) + text.length };
    },
  ],
  [
    /\[\[([^|\][]+)(?:\|[^\][]*)?\]\]/g,
    (m) => {
      const [text = '', target = ''] = m;
      const start = m.index ?? 0;
      return { kind: 'link', target, text, start, end: start + text.length };
    },
  ],
  [
    /<\/?([a-zA-Z][\w-]*)[^<>]*>/g,
    (m) => {
      const [text = '', name = ''] = m;
      const start = m.index ?? 0;
      return { kind: 'tag', name: name.toLowerCase(), text, start, end: start + text.length };
    },
  ],
];

/** `$1`, `{{PLURAL:$1|…}}`, `{{GENDER:$1|…}}`, `{{…}}`, `[[target|text]]`, and tags. A token
 * that would partly overlap one found before it is dropped. */
function scan(text: string): readonly PlaceholderToken[] {
  const found = PATTERNS.flatMap(([pattern, token]) =>
    [...text.matchAll(pattern)].flatMap((match) => token(match) ?? []),
  ).sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PlaceholderToken[] = [];
  for (const token of found) {
    const crosses = kept.some(
      (other) =>
        token.start < other.end &&
        other.start < token.end &&
        !(other.start <= token.start && token.end <= other.end),
    );
    if (!crosses) kept.push(token);
  }
  return kept;
}

function pathIn(folder: ProjectPath, file: string): Result<ProjectPath, PluginError> {
  const path = projectPath(folder === PROJECT_ROOT ? file : `${folder}/${file}`);
  return path.ok ? path : err({ code: 'formats.unsupported-project', reason: 'bad path' });
}

function folderOf(path: ProjectPath): ProjectPath {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? PROJECT_ROOT : (path.slice(0, slash) as ProjectPath);
}

function nameOf(path: ProjectPath): string {
  return path.slice(path.lastIndexOf('/') + 1, -EXTENSION.length);
}

/**
 * A catalog plugin for tests. By default it never detects. Its catalogs are the folders holding a
 * `<sourceLocale>.cat`, keyed by the folder (`.` for the root), and its locales the names of every
 * other `.cat` file (but `qqq`). Override any method.
 */
export function fakeCatalogPlugin(
  id: string,
  overrides: Partial<CatalogFormat> = {},
): PluginModule {
  const format: CatalogFormat = {
    kind: 'catalog',
    detect: () => Promise.resolve<Detection>({ matches: false }),
    open: async (context) => {
      if (Object.keys(context.options).length > 0) {
        return err({ code: 'formats.invalid-options', reason: 'takes no options' });
      }
      const listed = await context.files.list(PROJECT_ROOT, { extensions: [EXTENSION] });
      if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
      const all = listed.value;
      const catalogs: SourceCatalog[] = [];
      for (const path of all.filter((p) => nameOf(p) === context.sourceLocale)) {
        const folder = folderOf(path);
        const key = catalogKey(folder === PROJECT_ROOT ? ROOT_KEY : folder);
        if (!key.ok) return err({ code: 'formats.unsupported-project', reason: path });
        const documentation = all.find(
          (other) => folderOf(other) === folder && nameOf(other) === DOCUMENTATION,
        );
        catalogs.push({
          key: key.value,
          path,
          locale: context.sourceLocale,
          ...(documentation === undefined ? {} : { documentation }),
        });
      }
      const locales = new Set<LocaleId>([context.sourceLocale]);
      for (const path of all) {
        const locale = localeId(nameOf(path));
        if (locale.ok && nameOf(path) !== DOCUMENTATION) locales.add(locale.value);
      }
      const layout: CatalogLayout = {
        locales: [...locales].sort(),
        listCatalogs: () => Promise.resolve(ok(catalogs)),
        targetPathFor: (catalog, locale) => pathIn(folderOf(catalog.path), `${locale}${EXTENSION}`),
      };
      return ok(layout);
    },
    parse,
    serialize,
    placeholders: { scan },
    pluralForms: () => PLURAL_FORMS,
    ...overrides,
  };
  return { manifest: fakeManifest(id), create: () => format };
}
