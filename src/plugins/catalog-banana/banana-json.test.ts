// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { messageKey, type MessageChange, type MessageKey, type ParsedCatalog } from '#plugin-api';
import { parseBananaJson, serializeBananaJson } from './banana-json.ts';

function key(raw: string): MessageKey {
  const parsed = messageKey(raw);
  if (!parsed.ok) throw new Error(`test setup: ${raw}`);
  return parsed.value;
}

function parsed(text: string): ParsedCatalog {
  const result = parseBananaJson(text);
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}

const set = (k: string, text: string): MessageChange => ({ kind: 'set', key: key(k), text });
const remove = (k: string): MessageChange => ({ kind: 'remove', key: key(k) });

function write(target: string | null, changes: MessageChange[], source = target ?? ''): string {
  const result = serializeBananaJson({
    source: parsed(source),
    target: target === null ? null : parsed(target),
    changes,
  });
  if (!result.ok) throw new Error(`write failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

const tabbed =
  '{\n\t"@metadata": {\n\t\t"authors": [\n\t\t\t"A"\n\t\t]\n\t},\n\t"a": "A",\n\t"b": "B",\n\t"c": "C"\n}\n';

describe('parseBananaJson', () => {
  it('reads the messages in file order, without @metadata', () => {
    expect(parsed(tabbed).messages).toEqual([
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
      { key: 'c', text: 'C' },
    ]);
  });

  it('decodes escapes, and accepts a BOM and any metadata value', () => {
    const text =
      '\uFEFF{"@metadata": {"n": -1.5e3, "ok": [true, false, null, {}, []]}, "k": "\\"q\\" \\\\ \\/ \\b\\f\\n\\r\\t \\u05d0"}';
    expect(parsed(text).messages).toEqual([{ key: 'k', text: '"q" \\ / \b\f\n\r\t א' }]);
  });

  it('reads a file with no messages', () => {
    expect(parsed('{}').messages).toEqual([]);
    expect(parsed(' {\n\t"@metadata": {}\n}').messages).toEqual([]);
  });

  it.each([
    ['empty text', ''],
    ['not an object', '["a"]'],
    ['a duplicate key', '{"a": "1", "a": "2"}'],
    ['a message that is not a string', '{"a": 1}'],
    ['an empty key', '{"": "x"}'],
    ['a trailing comma', '{"a": "1",}'],
    ['text after the object', '{"a": "1"} x'],
    ['an unterminated string', '{"a": "1}'],
    ['a raw line break in a string', '{"a": "1\n2"}'],
    ['a bad escape', '{"a": "\\x"}'],
    ['a short \\u escape', '{"a": "\\u12zz"}'],
    ['broken metadata', '{"@metadata": {"a" 1}}'],
    ['a bad number', '{"@metadata": 01}'],
    ['a single-quoted string', "{'a': 'b'}"],
  ])('reports %s as formats.invalid-catalog', (_name, text) => {
    const result = parseBananaJson(text);
    expect(result.ok ? 'ok' : result.error.code).toBe('formats.invalid-catalog');
  });
});

describe('serializeBananaJson: changing a file', () => {
  it('gives back the text as read without changes', () => {
    expect(write(tabbed, [])).toBe(tabbed);
  });

  it("replaces only a changed message's value", () => {
    expect(write(tabbed, [set('b', 'New "b"\n')])).toBe(tabbed.replace('"B"', '"New \\"b\\"\\n"'));
  });

  it('leaves the file alone for a message set to its own text, or a missing one removed', () => {
    expect(write(tabbed, [set('a', 'A'), remove('missing')])).toBe(tabbed);
  });

  it('keeps a value written its own way when it is set to the same text', () => {
    const text = '{\n\t"a": "a\\/b \\u05d0"\n}\n';
    expect(write(text, [set('a', 'a/b א')])).toBe(text);
  });

  it('writes non-ASCII text as is, unless the file escapes it', () => {
    expect(write(tabbed, [set('a', 'שלום')])).toContain('"a": "שלום"');
    const mixed = '{\n\t"a": "H\\u00e1",\n\t"b": "á"\n}\n';
    expect(write(mixed, [set('a', 'Olá')])).toBe('{\n\t"a": "Olá",\n\t"b": "á"\n}\n');
    const escaped = '{\n\t"a": "H\\u00e1"\n}\n';
    expect(write(escaped, [set('a', 'Olá עד')])).toBe('{\n\t"a": "Ol\\u00e1 \\u05e2\\u05d3"\n}\n');
  });

  it.each([
    [
      'the first',
      'a',
      '{\n\t"@metadata": {\n\t\t"authors": [\n\t\t\t"A"\n\t\t]\n\t},\n\t"b": "B",\n\t"c": "C"\n}\n',
    ],
    [
      'a middle',
      'b',
      '{\n\t"@metadata": {\n\t\t"authors": [\n\t\t\t"A"\n\t\t]\n\t},\n\t"a": "A",\n\t"c": "C"\n}\n',
    ],
    [
      'the last',
      'c',
      '{\n\t"@metadata": {\n\t\t"authors": [\n\t\t\t"A"\n\t\t]\n\t},\n\t"a": "A",\n\t"b": "B"\n}\n',
    ],
  ])('removes %s message with its separator', (_name, k, expected) => {
    expect(write(tabbed, [remove(k)])).toBe(expected);
  });

  it('removes the only member, leaving an empty object', () => {
    expect(write('{\n  "a": "A"\n}\n', [remove('a')])).toBe('{}\n');
  });

  it('removes a message that comes before the metadata', () => {
    expect(write('{\n\t"a": "A",\n\t"@metadata": {}\n}', [remove('a')])).toBe(
      '{\n\t"@metadata": {}\n}',
    );
  });
});

describe('serializeBananaJson: adding messages', () => {
  const source = tabbed;

  it('adds after the nearest message before it in the source that the file has', () => {
    const target = '{\n\t"@metadata": {},\n\t"a": "א",\n\t"c": "ג"\n}\n';
    expect(write(target, [set('b', 'ב')], source)).toBe(
      '{\n\t"@metadata": {},\n\t"a": "א",\n\t"b": "ב",\n\t"c": "ג"\n}\n',
    );
  });

  it('adds before the first message when none before it is in the file', () => {
    const target = '{\n\t"@metadata": {},\n\t"c": "ג",\n\t"x": "not in source"\n}\n';
    expect(write(target, [set('a', 'א')], source)).toBe(
      '{\n\t"@metadata": {},\n\t"a": "א",\n\t"c": "ג",\n\t"x": "not in source"\n}\n',
    );
  });

  it('adds after the metadata when the file has no messages', () => {
    expect(write('{\n\t"@metadata": {}\n}', [set('b', 'ב')], source)).toBe(
      '{\n\t"@metadata": {},\n\t"b": "ב"\n}',
    );
  });

  it('adds into an empty object, on its own line', () => {
    expect(write('{}\n', [set('b', 'ב')], source)).toBe('{\n\t"b": "ב"\n}\n');
  });

  it("keeps the file's indentation, separator, and line endings", () => {
    const target = '{\r\n  "@metadata": {},\r\n  "a":"א"\r\n}';
    expect(write(target, [set('c', 'ג')], source)).toBe(
      '{\r\n  "@metadata": {},\r\n  "a":"א",\r\n  "c":"ג"\r\n}',
    );
  });

  it('indents like the members after the first, when the first sits right after the brace', () => {
    expect(write('{"@metadata": {},\n  "a": "א"\n}', [set('c', 'ג')], source)).toBe(
      '{"@metadata": {},\n  "a": "א",\n  "c": "ג"\n}',
    );
  });

  it('keeps a file on one line', () => {
    expect(write('{"a":"א"}', [set('b', 'ב')], source)).toBe('{"a":"א","b":"ב"}');
  });

  it('applies changes in order', () => {
    expect(write(tabbed, [set('a', '1'), remove('a'), set('a', '2')])).toContain('\t"a": "2",\n');
  });
});

describe('serializeBananaJson: a new file', () => {
  it('is written like the source: metadata with no authors, then messages in source order', () => {
    expect(write(null, [set('c', 'ג'), set('a', 'א')], tabbed)).toBe(
      '{\n\t"@metadata": {\n\t\t"authors": []\n\t},\n\t"a": "א",\n\t"c": "ג"\n}\n',
    );
  });

  it("follows the source's indentation, line endings, and final newline", () => {
    const source =
      '{\r\n    "@metadata": {\r\n        "authors": ["X"]\r\n    },\r\n    "a": "A"\r\n}';
    expect(write(null, [set('a', 'א')], source)).toBe(
      '{\r\n    "@metadata": {\r\n        "authors": []\r\n    },\r\n    "a": "א"\r\n}',
    );
  });

  it('has only metadata without changes', () => {
    expect(write(null, [], tabbed)).toBe('{\n\t"@metadata": {\n\t\t"authors": []\n\t}\n}\n');
  });

  it('stays on one line for a one-line source', () => {
    expect(write(null, [set('a', 'א')], '{"a":"A"}')).toBe('{"@metadata":{"authors":[]},"a":"א"}');
  });
});

describe('serializeBananaJson: malformed input', () => {
  it('reports a malformed target as formats.invalid-catalog', () => {
    const result = serializeBananaJson({
      source: parsed(tabbed),
      target: { text: '{', messages: [] },
      changes: [],
    });
    expect(result.ok ? 'ok' : result.error.code).toBe('formats.invalid-catalog');
  });
});
