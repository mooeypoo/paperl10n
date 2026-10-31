// SPDX-License-Identifier: GPL-3.0-or-later
// Reading and patching banana-i18n's JSON files without reformatting them. A file is one object:
// `@metadata` (any JSON value, kept as written) and messages (string values). Writing changes
// only the bytes of what changed, in the file's own style: indentation, the `": "` between key and
// value, line endings, the final newline, and whether non-ASCII text is escaped.
import {
  err,
  messageKey,
  ok,
  type CatalogEdit,
  type Message,
  type MessageChange,
  type MessageKey,
  type ParsedCatalog,
  type PluginError,
  type Result,
} from '#plugin-api';

const METADATA = '@metadata';

/** One member of the file's object, by its offsets in the text. */
interface Member {
  readonly key: string;
  /** Right after the `{` or `,` before it: the gap before its key starts here. */
  readonly gapStart: number;
  readonly keyStart: number;
  readonly keyEnd: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  /** The message's text; undefined for `@metadata`. */
  readonly text?: string;
}

interface CatalogObject {
  /** The offset of the closing `}`. */
  readonly close: number;
  readonly members: readonly Member[];
}

class Malformed extends Error {}

const WHITESPACE = /[ \t\n\r]*/y;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** Reads the file's object strictly (RFC 8259), tracking where each top-level member is. */
function readObject(text: string): CatalogObject {
  let at = text.startsWith('\uFEFF') ? 1 : 0;
  const fail = (what: string): never => {
    throw new Malformed(`${what} at offset ${String(at)}`);
  };
  const skipWhitespace = () => {
    WHITESPACE.lastIndex = at;
    WHITESPACE.exec(text);
    at = WHITESPACE.lastIndex;
  };
  const expect = (char: string) => {
    if (text[at] !== char) fail(`expected "${char}"`);
    at++;
  };
  const readString = (): string => {
    expect('"');
    let value = '';
    for (;;) {
      const char = text[at];
      if (char === undefined) return fail('unterminated string');
      if (char === '"') break;
      if (char < ' ') fail('control character in a string');
      if (char === '\\') {
        const escape = text[at + 1] ?? '';
        if (escape === 'u') {
          const hex = text.slice(at + 2, at + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad \\u escape');
          value += String.fromCharCode(parseInt(hex, 16));
          at += 6;
        } else {
          const decoded = ESCAPES[escape];
          if (decoded === undefined) return fail('bad escape');
          value += decoded;
          at += 2;
        }
      } else {
        value += char;
        at++;
      }
    }
    at++;
    return value;
  };
  const skipValue = (): void => {
    skipWhitespace();
    const char = text[at];
    if (char === '"') {
      readString();
    } else if (char === '{' || char === '[') {
      const closing = char === '{' ? '}' : ']';
      at++;
      skipWhitespace();
      if (text[at] === closing) {
        at++;
        return;
      }
      for (;;) {
        if (char === '{') {
          skipWhitespace();
          readString();
          skipWhitespace();
          expect(':');
        }
        skipValue();
        skipWhitespace();
        if (text[at] === ',') at++;
        else break;
      }
      expect(closing);
    } else if (text.startsWith('true', at)) {
      at += 4;
    } else if (text.startsWith('false', at)) {
      at += 5;
    } else if (text.startsWith('null', at)) {
      at += 4;
    } else {
      NUMBER.lastIndex = at;
      if (!NUMBER.test(text)) fail('expected a value');
      at = NUMBER.lastIndex;
    }
  };

  skipWhitespace();
  expect('{');
  const members: Member[] = [];
  const keys = new Set<string>();
  let gapStart = at;
  skipWhitespace();
  if (text[at] !== '}') {
    for (;;) {
      skipWhitespace();
      const keyStart = at;
      const key = readString();
      const keyEnd = at;
      if (keys.has(key)) fail(`duplicate key "${key}"`);
      keys.add(key);
      skipWhitespace();
      expect(':');
      skipWhitespace();
      const valueStart = at;
      let message: string | undefined;
      if (key === METADATA) {
        skipValue();
      } else {
        if (text[at] !== '"') fail(`the value of "${key}" isn't a string`);
        message = readString();
      }
      const valueEnd = at;
      members.push({
        key,
        gapStart,
        keyStart,
        keyEnd,
        valueStart,
        valueEnd,
        ...(message === undefined ? {} : { text: message }),
      });
      skipWhitespace();
      if (text[at] !== ',') break;
      at++;
      gapStart = at;
    }
  }
  skipWhitespace();
  const close = at;
  expect('}');
  skipWhitespace();
  if (at < text.length) fail('text after the object');
  return { close, members };
}

function read(text: string): Result<CatalogObject, PluginError> {
  try {
    return ok(readObject(text));
  } catch (thrown) {
    if (thrown instanceof Malformed) {
      return err({ code: 'formats.invalid-catalog', reason: thrown.message });
    }
    throw thrown;
  }
}

/** A banana-i18n file's messages, in file order. `@metadata` isn't a message. */
export function parseBananaJson(text: string): Result<ParsedCatalog, PluginError> {
  const object = read(text);
  if (!object.ok) return object;
  const messages: Message[] = [];
  for (const member of object.value.members) {
    if (member.text === undefined) continue;
    const key = messageKey(member.key);
    if (!key.ok) return err({ code: 'formats.invalid-catalog', reason: 'an empty message key' });
    messages.push({ key: key.value, text: member.text });
  }
  return ok({ text, messages });
}

/** How a file writes things, read from the file itself. */
interface Style {
  /** Between a `,` (or the `{`) and the next key: a line break and the indentation. */
  readonly gap: string;
  /** Between a key and its value, e.g. `": "` without the quotes: `: `. */
  readonly separator: string;
  /** Whether text outside ASCII is written as `\uXXXX`. */
  readonly escapeNonAscii: boolean;
  readonly finalNewline: string;
}

function styleOf(text: string, object: CatalogObject): Style {
  const { members } = object;
  const sample = members[1] ?? members[0];
  const gap = sample === undefined ? '\n\t' : text.slice(sample.gapStart, sample.keyStart);
  const first = members.find((m) => m.text !== undefined) ?? members[0];
  const separator = first === undefined ? ': ' : text.slice(first.keyEnd, first.valueStart);
  // MediaWiki writes Unicode as is; a file that escapes it and has none written raw keeps escaping.
  const escapeNonAscii =
    !/[\u0080-\uffff]/.test(text) && /\\u(?:00[89a-fA-F]|0[1-9a-fA-F]|[1-9a-fA-F])/.test(text);
  return { gap, separator, escapeNonAscii, finalNewline: /\r?\n$/.exec(text)?.[0] ?? '' };
}

function encode(value: string, style: Style): string {
  const json = JSON.stringify(value);
  return style.escapeNonAscii
    ? json.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    : json;
}

/** The text of a file with no messages yet, written like `source`. */
function emptyFileLike(style: Style): string {
  const lineBreak = /^\r?\n/.exec(style.gap)?.[0] ?? '';
  const indent = style.gap.slice(lineBreak.length);
  const inner = lineBreak === '' ? '' : `${style.gap}${indent}`;
  const metadata = `{${inner}"authors"${style.separator}[]${lineBreak === '' ? '' : style.gap}}`;
  return `{${style.gap}"${METADATA}"${style.separator}${metadata}${lineBreak}}${style.finalNewline}`;
}

function splice(text: string, start: number, end: number, insert: string): string {
  return text.slice(0, start) + insert + text.slice(end);
}

/** Applies one change; returns the text unchanged when there's nothing to do. */
function apply(
  text: string,
  change: MessageChange,
  sourceOrder: readonly MessageKey[],
  style: Style,
): Result<string, PluginError> {
  const object = read(text);
  if (!object.ok) return object;
  const { members, close } = object.value;
  const index = members.findIndex((m) => m.key === change.key && m.text !== undefined);
  const member = members[index];

  if (change.kind === 'remove') {
    if (member === undefined) return ok(text);
    const previous = members[index - 1];
    const next = members[index + 1];
    if (previous !== undefined) return ok(splice(text, previous.valueEnd, member.valueEnd, ''));
    if (next !== undefined) return ok(splice(text, member.keyStart, next.keyStart, ''));
    return ok(splice(text, member.gapStart, close, ''));
  }

  const written = `${encode(change.key, style)}${style.separator}${encode(change.text, style)}`;
  if (member !== undefined) {
    return ok(
      member.text === change.text
        ? text
        : splice(text, member.valueStart, member.valueEnd, encode(change.text, style)),
    );
  }
  // After the nearest message before it in the source that the file has; else before the first
  // message; else after the metadata; else into the empty object.
  const has = new Map(members.filter((m) => m.text !== undefined).map((m) => [m.key, m]));
  const before = sourceOrder.slice(0, Math.max(0, sourceOrder.indexOf(change.key)));
  const previousKey = [...before].reverse().find((key) => has.has(key));
  const after = previousKey === undefined ? undefined : has.get(previousKey);
  if (after !== undefined)
    return ok(splice(text, after.valueEnd, after.valueEnd, `,${style.gap}${written}`));
  const firstMessage = members.find((m) => m.text !== undefined);
  if (firstMessage !== undefined) {
    const at = firstMessage.keyStart;
    return ok(splice(text, at, at, `${written},${style.gap}`));
  }
  const last = members[members.length - 1];
  if (last !== undefined)
    return ok(splice(text, last.valueEnd, last.valueEnd, `,${style.gap}${written}`));
  const open = text.lastIndexOf('{', close);
  const lineBreak = /^\r?\n/.exec(style.gap)?.[0] ?? '';
  return ok(splice(text, open + 1, close, `${style.gap}${written}${lineBreak}`));
}

/** Writes the edit's changes into the target's text (or a new file shaped like the source). */
export function serializeBananaJson(edit: CatalogEdit): Result<string, PluginError> {
  const reference = edit.target?.text ?? edit.source.text;
  const object = read(reference);
  if (!object.ok) return object;
  const style = styleOf(reference, object.value);
  const sourceOrder = edit.source.messages.map((m) => m.key);
  let text = edit.target?.text ?? emptyFileLike(style);
  for (const change of edit.changes) {
    const applied = apply(text, change, sourceOrder, style);
    if (!applied.ok) return applied;
    text = applied.value;
  }
  return ok(text);
}
