// SPDX-License-Identifier: GPL-3.0-or-later
// Writes into a PO file the way GNU gettext's msgmerge does (write-po.c's `wrap`), so a project's
// next msgmerge run makes no diff: strings C-escaped, a field on one line when the whole line
// fits in 79 columns and has no line break inside, else `msgstr ""` followed by its lines, split
// after each `\n` and wherever a line would pass 79 columns. gettext breaks lines by Unicode's
// rules; this breaks after spaces only, which is the same for prose (a hyphenated word or CJK
// text can wrap differently).
// Edits patch the file as read: only the entries that change are rewritten, and a changed entry
// only where it changed (its msgstr, and its `fuzzy` flag and `#|` lines, which a translation
// clears).
import { headerFields, headerOf, readPo, type Line, type PoEntry, type PoFile } from './po-file.ts';

const PAGE_WIDTH = 79;

/** What to write: every form of a message (one, without plurals), or its removal. */
export type PoChange =
  | { readonly kind: 'set'; readonly key: string; readonly forms: readonly string[] }
  | { readonly kind: 'remove'; readonly key: string };

/** A message's key: its `msgid`, after its context and gettext's EOT separator if it has one. */
export function entryKey(entry: Pick<PoEntry, 'msgctxt' | 'msgid'>): string {
  return entry.msgctxt === undefined ? entry.msgid : `${entry.msgctxt}\u0004${entry.msgid}`;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\t': '\\t',
  '\r': '\\r',
  '\u0007': '\\a',
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
};

/** A string's escaped units (a character, or an escape such as `\n`), as written between quotes.
 * As gettext writes them: other control characters are copied as they are. */
function escapedUnits(value: string): string[] {
  return Array.from(value, (char) => ESCAPES[char] ?? char);
}

/** Columns, counted by code point (gettext counts display width: CJK can differ). */
const width = (text: string) => Array.from(text).length;

/**
 * A field's lines (`msgstr "Hello"`, or `msgstr ""` and its lines), with `prefix` before each
 * (`#~ ` for an obsolete entry).
 */
export function formatField(keyword: string, value: string, prefix = ''): string[] {
  const units = escapedUnits(value);
  const single = `${prefix}${keyword} "${units.join('')}"`;
  const newline = value.indexOf('\n');
  if ((newline === -1 || newline === value.length - 1) && width(single) <= PAGE_WIDTH) {
    return [single];
  }
  const lines = [`${prefix}${keyword} ""`];
  // As libunistring breaks them for gettext: a piece is a word and the spaces after it, and a line
  // breaks before the piece that would take it past the room between the quotes (trailing spaces
  // count). A piece too long for any line stays whole.
  const room = PAGE_WIDTH - width(prefix) - 2;
  let line = '';
  let piece = '';
  const endPiece = () => {
    if (line !== '' && width(line + piece) > room) {
      lines.push(`${prefix}"${line}"`);
      line = '';
    }
    line += piece;
    piece = '';
  };
  units.forEach((unit, index) => {
    piece += unit;
    const next = units[index + 1];
    if (unit === ' ' && next !== ' ') endPiece();
    if (unit === '\\n' || next === undefined) {
      endPiece();
      lines.push(`${prefix}"${line}"`);
      line = '';
    }
  });
  return lines;
}

/** An entry's msgstr lines for `forms` (`msgstr[N]` when it has a plural). */
export function msgstrLines(plural: boolean, forms: readonly string[], prefix = ''): string[] {
  return plural
    ? forms.flatMap((form, index) => formatField(`msgstr[${String(index)}]`, form, prefix))
    : formatField('msgstr', forms[0] ?? '', prefix);
}

const lineText = (file: PoFile, line: Line) => file.text.slice(line.start, line.end);

/** `#, a, b` without `fuzzy`; `null` when nothing is left. */
function withoutFuzzy(file: PoFile, line: Line): string | null {
  const text = lineText(file, line);
  const prefix = /^(#~\s*)?#,/.exec(text)?.[0] ?? '#,';
  const flags = text
    .slice(prefix.length)
    .split(',')
    .map((flag) => flag.trim())
    .filter((flag) => flag !== '' && flag !== 'fuzzy');
  return flags.length === 0 ? null : `${prefix} ${flags.join(', ')}`;
}

/** The lines of `entry` before its msgstr, without `#|` lines or a `fuzzy` flag (a new entry). */
function linesBeforeMsgstr(file: PoFile, entry: PoEntry): string[] {
  return entry.lines.flatMap((line) => {
    if (line.start >= entry.msgstrStart || entry.previousLines.includes(line)) return [];
    if (entry.flagLines.includes(line)) return withoutFuzzy(file, line) ?? [];
    return [lineText(file, line)];
  });
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** Rewrites `entry`'s msgstr to `forms`, dropping its `fuzzy` flag and `#|` lines. */
function retranslate(file: PoFile, entry: PoEntry, forms: readonly string[]): string {
  const eol = file.lineBreak;
  const lastBreak = file.text.slice(0, entry.msgstrEnd).endsWith('\n');
  const edits: Edit[] = [
    {
      start: entry.msgstrStart,
      end: entry.msgstrEnd,
      text: msgstrLines(entry.msgidPlural !== undefined, forms).join(eol) + (lastBreak ? eol : ''),
    },
    ...entry.previousLines.map((line) => ({ start: line.start, end: line.next, text: '' })),
    ...entry.flagLines.map((line) => {
      const kept = withoutFuzzy(file, line);
      return kept === null
        ? { start: line.start, end: line.next, text: '' }
        : { start: line.start, end: line.end, text: kept };
    }),
  ];
  return applyEdits(file.text, edits);
}

/** Writes `entry` as obsolete (`#~`), as msgmerge does with a message its template dropped. */
function makeObsolete(file: PoFile, entry: PoEntry): string {
  const eol = file.lineBreak;
  const lines = entry.lines.flatMap((line) => {
    const text = lineText(file, line);
    if (/^#[.:,|]/.test(text)) return [];
    return text.startsWith('#') ? [text] : [`#~ ${text}`];
  });
  const lastBreak = file.text.slice(0, entry.end).endsWith('\n');
  return applyEdits(file.text, [
    { start: entry.start, end: entry.end, text: lines.join(eol) + (lastBreak ? eol : '') },
  ]);
}

const live = (file: PoFile) => file.entries.filter((entry) => !entry.obsolete);

/** `forms` as many as a plural entry has: missing ones empty. */
const padded = (forms: readonly string[], count: number) => [
  ...forms,
  ...Array.from({ length: Math.max(0, count - forms.length) }, () => ''),
];

/** A new entry for `key`: the source's entry (its comments and msgid) with `forms` as msgstr. */
function newEntryLines(
  source: PoFile,
  key: string,
  forms: readonly string[],
  pluralCount: number,
): string[] {
  const from = live(source).find((entry) => entryKey(entry) === key);
  if (from === undefined) {
    const separator = key.indexOf('\u0004');
    const head =
      separator < 0
        ? formatField('msgid', key)
        : [
            ...formatField('msgctxt', key.slice(0, separator)),
            ...formatField('msgid', key.slice(separator + 1)),
          ];
    return [...head, ...msgstrLines(false, forms)];
  }
  return [
    ...linesBeforeMsgstr(source, from),
    ...(from.msgidPlural === undefined
      ? msgstrLines(false, forms)
      : msgstrLines(true, padded(forms, pluralCount))),
  ];
}

/** Adds an entry for `key` after the nearest entry before it in the source that `file` has. */
function insert(
  file: PoFile,
  source: PoFile,
  key: string,
  forms: readonly string[],
  pluralCount: number,
): string {
  const eol = file.lineBreak;
  const block = newEntryLines(source, key, forms, pluralCount).join(eol);
  const sourceKeys = live(source).map(entryKey);
  const present = new Map(live(file).map((entry) => [entryKey(entry), entry]));
  const before = sourceKeys
    .slice(0, Math.max(0, sourceKeys.indexOf(key)))
    .reverse()
    .map((k) => (k === '' ? undefined : present.get(k)))
    .find((entry) => entry !== undefined);
  const after = before ?? headerOf(file);
  if (after === undefined) {
    const first = file.entries[0];
    if (first === undefined) return file.text === '' ? block + eol : file.text + eol + block + eol;
    return applyEdits(file.text, [
      { start: first.start, end: first.start, text: block + eol + eol },
    ]);
  }
  const ended = file.text.slice(0, after.end).endsWith('\n');
  return applyEdits(file.text, [
    { start: after.end, end: after.end, text: ended ? eol + block + eol : eol + eol + block },
  ]);
}

/** Applies `changes` to `target` in order, patching its text. */
export function patchPo(
  target: PoFile,
  source: PoFile,
  changes: readonly PoChange[],
  pluralCount: number,
): string {
  let file = target;
  const sourceKeys = new Set(live(source).map(entryKey));
  for (const change of changes) {
    const entry = live(file).find((candidate) => entryKey(candidate) === change.key);
    let text = file.text;
    if (change.kind === 'set') {
      if (entry === undefined) text = insert(file, source, change.key, change.forms, pluralCount);
      else {
        // A change with fewer forms than the entry has keeps the rest (an editor that only
        // knows the first form can't lose the others).
        const forms =
          entry.msgidPlural === undefined
            ? change.forms.slice(0, 1)
            : [...change.forms, ...entry.msgstr.slice(change.forms.length)];
        const same =
          forms.length === entry.msgstr.length &&
          forms.every((form, index) => form === entry.msgstr[index]) &&
          !entry.flags.includes('fuzzy') &&
          entry.previousLines.length === 0;
        if (!same) text = retranslate(file, entry, forms);
      }
    } else if (entry !== undefined) {
      if (sourceKeys.has(change.key)) {
        // Still in the template: untranslated, as msgmerge keeps it.
        const count = entry.msgidPlural === undefined ? 1 : Math.max(pluralCount, 1);
        const empty = Array.from({ length: count }, () => '');
        const done =
          entry.msgstr.every((form) => form === '') &&
          !entry.flags.includes('fuzzy') &&
          entry.previousLines.length === 0;
        if (!done) text = retranslate(file, entry, empty);
      } else {
        text = makeObsolete(file, entry);
      }
    }
    if (text !== file.text) {
      const read = readPo(text);
      if (!read.ok) throw new Error(`catalog-gettext wrote a file it can't read: ${read.reason}`);
      file = read.file;
    }
  }
  return file.text;
}

/**
 * A new translation's header: the template's fields with `set` changed (added at the end when
 * missing), and `clear` emptied where the template has them (its placeholders, like
 * `FULL NAME <EMAIL@ADDRESS>`, aren't true of a new translation).
 */
function newHeader(
  source: PoFile,
  set: ReadonlyMap<string, string>,
  clear: readonly string[],
): string {
  const fields = new Map(headerFields(headerOf(source)));
  const named = (name: string) =>
    [...fields.keys()].find((key) => key.toLowerCase() === name.toLowerCase());
  for (const name of clear) {
    const existing = named(name);
    if (existing !== undefined) fields.set(existing, '');
  }
  for (const [name, value] of set) fields.set(named(name) ?? name, value);
  return [...fields].map(([name, value]) => `${name}: ${value}\n`).join('');
}

/**
 * A new translation from the source (a template, or the source locale's file): its header with
 * `language` and `pluralForms`, then every entry in the source's order, untranslated unless a
 * change sets it.
 */
export function newPo(
  source: PoFile,
  language: string,
  pluralForms: string,
  pluralCount: number,
  changes: readonly PoChange[],
): string {
  const eol = source.lineBreak;
  const set = new Map<string, readonly string[]>();
  for (const change of changes) {
    if (change.kind === 'set') set.set(change.key, change.forms);
    else set.delete(change.key);
  }
  const sourceHeader = headerOf(source);
  const headerComments =
    sourceHeader === undefined
      ? []
      : linesBeforeMsgstr(source, sourceHeader).filter((line) => line.startsWith('#'));
  const fields = new Map([
    ['Language', language],
    ['Content-Type', 'text/plain; charset=UTF-8'],
    ['Plural-Forms', pluralForms],
  ]);
  const header = newHeader(source, fields, ['PO-Revision-Date', 'Last-Translator']);
  const blocks = [[...headerComments, 'msgid ""', ...formatField('msgstr', header)]];
  for (const entry of live(source)) {
    if (entry === sourceHeader) continue;
    const plural = entry.msgidPlural !== undefined;
    const forms = set.get(entryKey(entry)) ?? [];
    blocks.push([
      ...linesBeforeMsgstr(source, entry),
      ...msgstrLines(plural, plural ? padded(forms, Math.max(pluralCount, 1)) : padded(forms, 1)),
    ]);
  }
  return blocks.map((lines) => lines.join(eol)).join(eol + eol) + eol;
}
