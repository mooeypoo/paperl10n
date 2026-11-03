// SPDX-License-Identifier: GPL-3.0-or-later
// Reads a gettext PO (or POT) file into its entries, keeping where each line is, so the writer can
// patch an entry and leave every other byte as it was. The syntax (GNU gettext manual, "The Format
// of PO Files"): comments (`# ` translator, `#.` extracted, `#:` reference, `#,` flags, `#|`
// previous), then `msgctxt`, `msgid`, `msgid_plural`, and `msgstr` or `msgstr[N]`, each a quoted
// C string that may continue on the following lines. Obsolete entries are the same lines behind
// `#~`. The entry with an empty `msgid` (and no context) is the header.

/** One line of the file: where it starts, where its text ends, and where the next line starts. */
export interface Line {
  readonly start: number;
  readonly end: number;
  readonly next: number;
}

export interface PoEntry {
  /** The entry's first line to its last, line break included. */
  readonly start: number;
  readonly end: number;
  readonly lines: readonly Line[];
  /** `# ` comments, without the `#`. */
  readonly translatorComments: readonly string[];
  /** `#.` comments, without `#.` and one space. */
  readonly extractedComments: readonly string[];
  /** `#,` flags, in order (`fuzzy`, `c-format`, …). */
  readonly flags: readonly string[];
  /** The lines of `#,` and `#|` comments: what setting a message rewrites or drops. */
  readonly flagLines: readonly Line[];
  readonly previousLines: readonly Line[];
  /** `#| msgid`: the source the translation was made for. */
  readonly previousMsgid?: string;
  readonly msgctxt?: string;
  readonly msgid: string;
  readonly msgidPlural?: string;
  /** `msgstr`, or each `msgstr[N]` in order. */
  readonly msgstr: readonly string[];
  /** The first `msgstr` line's start to the last one's next line: what a new translation replaces. */
  readonly msgstrStart: number;
  readonly msgstrEnd: number;
  readonly obsolete: boolean;
}

export interface PoFile {
  readonly text: string;
  /** The file's line break (its first one; `\n` when it has none). */
  readonly lineBreak: string;
  readonly entries: readonly PoEntry[];
}

export type PoReadResult = { ok: true; file: PoFile } | { ok: false; reason: string };

const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  a: '\u0007',
  b: '\b',
  f: '\f',
  v: '\v',
  '\\': '\\',
  '"': '"',
  "'": "'",
  '?': '?',
};

/** A quoted C string's value (`"a\\nb"` → `a` newline `b`), or `null` if it isn't one. */
export function readQuoted(raw: string): string | null {
  const text = raw.trim();
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return null;
  let value = '';
  for (let i = 1; i < text.length - 1; i++) {
    const char = text[i] ?? '';
    if (char === '"') return null; // an unescaped quote inside
    if (char !== '\\') {
      value += char;
      continue;
    }
    const next = text[i + 1] ?? '';
    if (i + 1 >= text.length - 1) return null; // a backslash escaping the closing quote
    const simple = ESCAPES[next];
    if (simple !== undefined) {
      value += simple;
      i++;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4));
    const hex = /^x([0-9a-fA-F]{1,2})/.exec(text.slice(i + 1, i + 4));
    if (octal !== null) {
      value += String.fromCharCode(Number.parseInt(octal[0], 8));
      i += octal[0].length;
    } else if (hex?.[1] !== undefined) {
      value += String.fromCharCode(Number.parseInt(hex[1], 16));
      i += hex[0].length;
    } else {
      return null;
    }
  }
  return value;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start < text.length) {
    const lf = text.indexOf('\n', start);
    if (lf === -1) {
      lines.push({ start, end: text.length, next: text.length });
      break;
    }
    const end = lf > start && text[lf - 1] === '\r' ? lf - 1 : lf;
    lines.push({ start, end, next: lf + 1 });
    start = lf + 1;
  }
  return lines;
}

const KEYWORD = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+(".*)$/;

/** An entry being read. */
interface Draft {
  lines: Line[];
  translatorComments: string[];
  extractedComments: string[];
  flags: string[];
  flagLines: Line[];
  previousLines: Line[];
  previous: Partial<Record<'msgctxt' | 'msgid' | 'msgid_plural', string>>;
  fields: Partial<Record<'msgctxt' | 'msgid' | 'msgid_plural', string>>;
  msgstr: string[];
  msgstrStart: number;
  msgstrEnd: number;
  /** The field the next continuation string adds to. */
  last: { readonly into: 'fields' | 'previous' | 'msgstr'; readonly key: string } | null;
  obsolete: boolean | null;
}

const newDraft = (): Draft => ({
  lines: [],
  translatorComments: [],
  extractedComments: [],
  flags: [],
  flagLines: [],
  previousLines: [],
  previous: {},
  fields: {},
  msgstr: [],
  msgstrStart: -1,
  msgstrEnd: -1,
  last: null,
  obsolete: null,
});

/** Reads a PO file. Malformed syntax is a reason, never a throw. */
export function readPo(text: string): PoReadResult {
  const lines = splitLines(text);
  const lineBreak = /\r?\n/.exec(text)?.[0] ?? '\n';
  const entries: PoEntry[] = [];
  let draft = newDraft();
  const fail = (line: Line, why: string): PoReadResult => ({
    ok: false,
    reason: `line ${String(lines.indexOf(line) + 1)}: ${why}`,
  });

  /** Ends the entry being read; comments alone (no `msgid`) aren't one. */
  const close = (): string | null => {
    if (draft.fields.msgid === undefined) {
      if (draft.msgstr.length > 0) return 'msgstr without msgid';
      draft = newDraft();
      return null;
    }
    if (draft.msgstr.length === 0) return `msgid without msgstr`;
    const first = draft.lines[0];
    const last = draft.lines[draft.lines.length - 1];
    if (first === undefined || last === undefined) return 'empty entry';
    entries.push({
      start: first.start,
      end: last.next,
      lines: draft.lines,
      translatorComments: draft.translatorComments,
      extractedComments: draft.extractedComments,
      flags: draft.flags,
      flagLines: draft.flagLines,
      previousLines: draft.previousLines,
      ...(draft.previous.msgid === undefined ? {} : { previousMsgid: draft.previous.msgid }),
      ...(draft.fields.msgctxt === undefined ? {} : { msgctxt: draft.fields.msgctxt }),
      msgid: draft.fields.msgid,
      ...(draft.fields.msgid_plural === undefined
        ? {}
        : { msgidPlural: draft.fields.msgid_plural }),
      msgstr: draft.msgstr,
      msgstrStart: draft.msgstrStart,
      msgstrEnd: draft.msgstrEnd,
      obsolete: draft.obsolete === true,
    });
    draft = newDraft();
    return null;
  };

  for (const line of lines) {
    let content = text.slice(line.start, line.end);
    if (content.trim() === '') {
      const problem = close();
      if (problem !== null) return fail(line, problem);
      continue;
    }
    // Obsolete lines are ordinary lines behind `#~`; `#~|` is an obsolete previous comment.
    let obsolete = false;
    if (content.startsWith('#~')) {
      obsolete = true;
      content = content.slice(2).trimStart();
      if (content.startsWith('|')) content = `#${content}`;
    }
    const isComment = content.startsWith('#');
    const keyword = isComment ? null : KEYWORD.exec(content);
    // A comment, msgctxt, or msgid after a msgstr starts the next entry, blank line or not.
    const opensEntry = isComment || keyword?.[1] === 'msgctxt' || keyword?.[1] === 'msgid';
    if (opensEntry && draft.msgstr.length > 0) {
      const problem = close();
      if (problem !== null) return fail(line, problem);
    }
    // Only an entry's message lines say whether it's obsolete: msgmerge keeps an obsolete
    // entry's translator comments as plain `# ` lines.
    if (!isComment) {
      if (draft.obsolete !== null && draft.obsolete !== obsolete) {
        return fail(line, 'obsolete and live lines in one entry');
      }
      draft.obsolete = obsolete;
    }
    draft.lines.push(line);

    if (isComment) {
      const kind = content[1] ?? '';
      const body = content.slice(2);
      if (kind === '.') draft.extractedComments.push(body.startsWith(' ') ? body.slice(1) : body);
      else if (kind === ',') {
        draft.flagLines.push(line);
        draft.flags.push(
          ...body
            .split(',')
            .map((flag) => flag.trim())
            .filter((flag) => flag !== ''),
        );
      } else if (kind === '|') {
        draft.previousLines.push(line);
        const previous = /^\s*(msgctxt|msgid_plural|msgid)\s+(".*)$/.exec(body);
        const continued = previous === null ? readQuoted(body) : null;
        if (previous?.[1] !== undefined && previous[2] !== undefined) {
          const value = readQuoted(previous[2]);
          if (value === null) return fail(line, 'a malformed string');
          const key = previous[1] as 'msgctxt' | 'msgid' | 'msgid_plural';
          draft.previous[key] = value;
          draft.last = { into: 'previous', key };
        } else if (continued !== null && draft.last?.into === 'previous') {
          const key = draft.last.key as 'msgctxt' | 'msgid' | 'msgid_plural';
          draft.previous[key] = (draft.previous[key] ?? '') + continued;
        }
      } else if (kind !== ':') {
        draft.translatorComments.push(content.slice(1));
      }
      continue;
    }

    if (keyword !== null) {
      const [, name = '', index, raw = ''] = keyword;
      const value = readQuoted(raw);
      if (value === null) return fail(line, 'a malformed string');
      if (name.startsWith('msgstr')) {
        if (draft.fields.msgid === undefined) return fail(line, 'msgstr without msgid');
        const expected = draft.msgstr.length;
        if ((index === undefined) !== (draft.fields.msgid_plural === undefined)) {
          return fail(
            line,
            index === undefined ? 'msgstr in a plural entry' : 'msgstr[N] without msgid_plural',
          );
        }
        if (index !== undefined && Number(index) !== expected)
          return fail(line, `msgstr[${index}] out of order`);
        if (index === undefined && expected > 0) return fail(line, 'a second msgstr');
        if (draft.msgstrStart < 0) draft.msgstrStart = line.start;
        draft.msgstr.push(value);
        draft.msgstrEnd = line.next;
        draft.last = { into: 'msgstr', key: String(expected) };
      } else {
        const key = name as 'msgctxt' | 'msgid' | 'msgid_plural';
        if (draft.fields[key] !== undefined || draft.msgstr.length > 0)
          return fail(line, `a second ${key}`);
        if (key === 'msgid_plural' && draft.fields.msgid === undefined)
          return fail(line, 'msgid_plural before msgid');
        if (key === 'msgctxt' && draft.fields.msgid !== undefined)
          return fail(line, 'msgctxt after msgid');
        draft.fields[key] = value;
        draft.last = { into: 'fields', key };
      }
      continue;
    }

    const continued = readQuoted(content);
    if (continued === null || draft.last === null || draft.last.into === 'previous') {
      return fail(line, 'not a PO line');
    }
    if (draft.last.into === 'msgstr') {
      const index = Number(draft.last.key);
      draft.msgstr[index] = (draft.msgstr[index] ?? '') + continued;
      draft.msgstrEnd = line.next;
    } else {
      const key = draft.last.key as 'msgctxt' | 'msgid' | 'msgid_plural';
      draft.fields[key] = (draft.fields[key] ?? '') + continued;
    }
  }
  const end = lines[lines.length - 1];
  const problem = close();
  if (problem !== null && end !== undefined) return fail(end, problem);
  return { ok: true, file: { text, lineBreak, entries } };
}

/** The header entry: the live one with an empty `msgid` and no context. */
export function headerOf(file: PoFile): PoEntry | undefined {
  return file.entries.find(
    (entry) => !entry.obsolete && entry.msgid === '' && entry.msgctxt === undefined,
  );
}

/** A header's fields (`Plural-Forms` → `nplurals=2; …`), by name as written. */
export function headerFields(header: PoEntry | undefined): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of (header?.msgstr[0] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return fields;
}

/** A field of a header, by name ignoring case. */
export function headerField(header: PoEntry | undefined, name: string): string | undefined {
  for (const [key, value] of headerFields(header)) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }
  return undefined;
}
