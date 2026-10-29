// SPDX-License-Identifier: GPL-3.0-or-later
// Edits one top-level value of the config file's text, keeping every other byte: the user's
// formatting, key order, line endings, and unknown keys. Pure.
import { err, ok, type Result } from '#kernel/result';
import type { InvalidConfig } from './project-config.ts';

interface Member {
  readonly key: string;
  /** Where the member starts (its key's opening quote). */
  readonly start: number;
  /** Just after the key's closing quote. */
  readonly keyEnd: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

interface TopLevelObject {
  readonly open: number;
  readonly close: number;
  readonly members: readonly Member[];
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

function skipWhitespace(text: string, i: number): number {
  while (i < text.length && WHITESPACE.has(text.charAt(i))) i++;
  return i;
}

/** The index just after the string starting at `i` (an opening quote), or -1. */
function skipString(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) {
    const char = text.charAt(j);
    if (char === '\\') j++;
    else if (char === '"') return j + 1;
  }
  return -1;
}

/** The index just after the value starting at `i`, or -1. The text is valid JSON already. */
function skipValue(text: string, i: number): number {
  const first = text.charAt(i);
  if (first === '"') return skipString(text, i);
  if (first === '{' || first === '[') {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      const char = text.charAt(j);
      if (char === '"') {
        j = skipString(text, j) - 1;
        if (j < 0) return -1;
      } else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }
  let j = i;
  while (j < text.length && !',}] \t\n\r'.includes(text.charAt(j))) j++;
  return j === i ? -1 : j;
}

function scanTopLevel(text: string): TopLevelObject | null {
  let i = skipWhitespace(text, text.startsWith('\uFEFF') ? 1 : 0);
  if (text.charAt(i) !== '{') return null;
  const open = i;
  const members: Member[] = [];
  i = skipWhitespace(text, i + 1);
  if (text.charAt(i) === '}') return { open, close: i, members };
  for (;;) {
    if (text.charAt(i) !== '"') return null;
    const keyEnd = skipString(text, i);
    if (keyEnd < 0) return null;
    const key: unknown = JSON.parse(text.slice(i, keyEnd));
    let j = skipWhitespace(text, keyEnd);
    if (text.charAt(j) !== ':') return null;
    const valueStart = skipWhitespace(text, j + 1);
    const valueEnd = skipValue(text, valueStart);
    if (valueEnd < 0 || typeof key !== 'string') return null;
    members.push({ key, start: i, keyEnd, valueStart, valueEnd });
    j = skipWhitespace(text, valueEnd);
    if (text.charAt(j) === '}') return { open, close: j, members };
    if (text.charAt(j) !== ',') return null;
    i = skipWhitespace(text, j + 1);
  }
}

/** JSON values compared by content, ignoring key order. */
function sameJson(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
  } catch {
    return undefined;
  }
}

const notAnObject: InvalidConfig = {
  code: 'workspace.config-invalid',
  problems: [{ field: '(file)', problem: 'must be a JSON object' }],
};

/**
 * Sets a top-level string member. An existing member keeps its place and only its value changes
 * (the last one, if the key repeats, as that's the one JSON readers use). A new member goes
 * right after `after` when that key exists, otherwise first, copying the file's own spacing.
 */
export function setConfigString(
  text: string,
  key: string,
  value: string,
  options: { readonly after?: string } = {},
): Result<string, InvalidConfig> {
  const object = scanTopLevel(text);
  const before = parse(text);
  if (object === null || typeof before !== 'object' || before === null || Array.isArray(before))
    return err(notAnObject);

  const json = JSON.stringify(value);
  const existing = object.members.findLast((member) => member.key === key);
  let edited: string;
  if (existing !== undefined) {
    edited = text.slice(0, existing.valueStart) + json + text.slice(existing.valueEnd);
  } else if (object.members.length === 0) {
    const inner = text.slice(object.open + 1, object.close);
    const newline = inner.includes('\r\n') ? '\r\n' : '\n';
    const body = inner.includes('\n')
      ? `${newline}  ${JSON.stringify(key)}: ${json}${newline}`
      : ` ${JSON.stringify(key)}: ${json} `;
    edited = text.slice(0, object.open + 1) + body + text.slice(object.close);
  } else {
    const anchor = object.members.find((member) => member.key === options.after);
    const first = object.members[0];
    if (first === undefined) return err(notAnObject);
    const model = anchor ?? first;
    // The spacing the file uses: before a member (after `{` or `,`), and around the colon.
    const previous = object.members[object.members.indexOf(model) - 1];
    const lead = text.slice(
      previous === undefined ? object.open + 1 : text.lastIndexOf(',', model.start) + 1,
      model.start,
    );
    const separator = lead === '' ? '' : lead.includes('\n') ? lead : ' ';
    const member = JSON.stringify(key) + text.slice(model.keyEnd, model.valueStart) + json;
    edited =
      anchor === undefined
        ? text.slice(0, first.start) + member + ',' + separator + text.slice(first.start)
        : text.slice(0, anchor.valueEnd) + ',' + separator + member + text.slice(anchor.valueEnd);
  }

  // A safety net: the result must say exactly the same, with only this value changed.
  if (!sameJson(parse(edited), { ...before, [key]: value })) return err(notAnObject);
  return ok(edited);
}
