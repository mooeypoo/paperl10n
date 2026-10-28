// SPDX-License-Identifier: GPL-3.0-or-later
// Reads Starlight's `locales` from an Astro config *without running it*: a plugin never executes
// project code. Only the plain object literal form is understood:
//
//   locales: { root: { label: 'English', lang: 'en' }, 'pt-br': { label: '…', lang: 'pt-BR' } }
//
// Anything dynamic (a variable, a spread, a computed key, a function call) gives `null`, and the
// plugin falls back to folder conventions. The key is the folder (`root`: none); `lang` is the
// BCP 47 tag, defaulting to the key, as in Starlight itself.

export interface StarlightLocale {
  /** The locale's folder under the content dir; `''` for Starlight's `root` locale. */
  readonly folder: string;
  /** The `lang` tag as written (or the key, when `lang` is absent and the key isn't `root`). */
  readonly lang: string | null;
}

/** Index just past the string, template, or comment starting at `i`, or `i` if there's none. */
function skipNonCode(text: string, i: number): number {
  const char = text[i];
  if (char === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i);
    return end === -1 ? text.length : end;
  }
  if (char === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (char === "'" || char === '"' || char === '`') {
    let j = i + 1;
    while (j < text.length && text[j] !== char) j += text[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i;
}

/** The index of the `}` matching the `{` at `open`, skipping strings and comments. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const skipped = skipNonCode(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return i;
    i++;
  }
  return -1;
}

/** Index of the next character that isn't whitespace or a comment. */
function skipSpace(text: string, i: number): number {
  let j = i;
  for (;;) {
    while (j < text.length && /\s/.test(text[j] ?? '')) j++;
    if (text[j] === '/' && (text[j + 1] === '/' || text[j + 1] === '*')) j = skipNonCode(text, j);
    else return j;
  }
}

const STRING_VALUE = /^\s*(['"])((?:(?!\1)[^\\\n])*)\1/;

/** The value of a plain-string property at the top level of an object body, if present. */
function stringProperty(body: string, name: string): string | null | undefined {
  let i = 0;
  let depth = 0;
  while (i < body.length) {
    const skipped = skipNonCode(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const char = body[i];
    if (char === '{' || char === '[' || char === '(') depth++;
    else if (char === '}' || char === ']' || char === ')') depth--;
    else if (depth === 0 && body.startsWith(name, i) && !/[\w$]/.test(body[i - 1] ?? ' ')) {
      const after = skipSpace(body, i + name.length);
      if (body[after] === ':') {
        const value = STRING_VALUE.exec(body.slice(after + 1));
        return value === null ? null : (value[2] ?? null); // null: present but not a plain string
      }
    }
    i++;
  }
  return undefined;
}

/** Starlight's locales from an Astro config's text, or `null` if they can't be read statically. */
export function readStarlightLocales(text: string): StarlightLocale[] | null {
  const start = /\blocales\s*:\s*\{/.exec(text);
  if (start === null) return null;
  const open = start.index + start[0].length - 1;
  const close = matchingBrace(text, open);
  if (close === -1) return null;

  const locales: StarlightLocale[] = [];
  let i = skipSpace(text, open + 1);
  while (i < close) {
    // A key: an identifier or a quoted string. Anything else (`...spread`, `[computed]`) is dynamic.
    let key: string;
    const quoted = /^(['"])([^'"\\\n]*)\1/.exec(text.slice(i, close));
    const bare = /^[A-Za-z_$][\w$-]*/.exec(text.slice(i, close));
    if (quoted !== null) {
      key = quoted[2] ?? '';
      i += quoted[0].length;
    } else if (bare !== null && !bare[0].includes('-')) {
      key = bare[0];
      i += key.length;
    } else {
      return null;
    }
    i = skipSpace(text, i);
    if (text[i] !== ':') return null;
    i = skipSpace(text, i + 1);
    if (text[i] !== '{') return null; // a variable or a call: dynamic
    const end = matchingBrace(text, i);
    if (end === -1 || end > close) return null;
    const lang = stringProperty(text.slice(i + 1, end), 'lang');
    if (lang === null) return null; // `lang` is an expression
    locales.push({
      folder: key === 'root' ? '' : key,
      lang: lang ?? (key === 'root' ? null : key),
    });
    i = skipSpace(text, end + 1);
    if (text[i] === ',') i = skipSpace(text, i + 1);
    else if (i < close) return null;
  }
  return locales;
}
