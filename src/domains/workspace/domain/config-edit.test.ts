// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { setConfigString } from './config-edit.ts';

const set = (text: string) =>
  setConfigString(text, 'targetLocale', 'he', { after: 'sourceLocale' });

describe('setConfigString', () => {
  it.each<[string, string, string]>([
    [
      'replaces an existing value only',
      '{ "sourceLocale": "en", "targetLocale": "fr" }',
      '{ "sourceLocale": "en", "targetLocale": "he" }',
    ],
    [
      'keeps odd spacing, other keys, and unknown keys byte for byte',
      '{\n\t"x" :[1, {"targetLocale":"no"}],\n\t"targetLocale"  :   "fr" ,\n\t"y": null\n}\n',
      '{\n\t"x" :[1, {"targetLocale":"no"}],\n\t"targetLocale"  :   "he" ,\n\t"y": null\n}\n',
    ],
    [
      'changes the last of repeated keys (the one JSON readers use)',
      '{"targetLocale":"fr","targetLocale":"de"}',
      '{"targetLocale":"fr","targetLocale":"he"}',
    ],
    [
      'adds a missing key after the anchor, in a multi-line file',
      '{\n  "sourceLocale": "en",\n  "documentFormat": "format-starlight"\n}\n',
      '{\n  "sourceLocale": "en",\n  "targetLocale": "he",\n  "documentFormat": "format-starlight"\n}\n',
    ],
    [
      'adds after an anchor that is the last member',
      '{\n  "documentFormat": "format-starlight",\n  "sourceLocale": "en"\n}',
      '{\n  "documentFormat": "format-starlight",\n  "sourceLocale": "en",\n  "targetLocale": "he"\n}',
    ],
    [
      'adds on one line',
      '{ "sourceLocale": "en" }',
      '{ "sourceLocale": "en", "targetLocale": "he" }',
    ],
    [
      'adds to a minified file',
      '{"sourceLocale":"en"}',
      '{"sourceLocale":"en","targetLocale":"he"}',
    ],
    [
      'adds first when the anchor is missing',
      '{\n    "documentFormat": "format-starlight"\n}',
      '{\n    "targetLocale": "he",\n    "documentFormat": "format-starlight"\n}',
    ],
    [
      'keeps CRLF line endings',
      '{\r\n  "sourceLocale": "en"\r\n}\r\n',
      '{\r\n  "sourceLocale": "en",\r\n  "targetLocale": "he"\r\n}\r\n',
    ],
    ['fills an empty object', '{}', '{ "targetLocale": "he" }'],
    ['fills an empty multi-line object', '{\r\n}\r\n', '{\r\n  "targetLocale": "he"\r\n}\r\n'],
    ['keeps a BOM', '\uFEFF{"targetLocale": "fr"}', '\uFEFF{"targetLocale": "he"}'],
    [
      'handles escapes in strings',
      '{"a": "say \\"}\\"", "sourceLocale": "en"}',
      '{"a": "say \\"}\\"", "sourceLocale": "en", "targetLocale": "he"}',
    ],
  ])('%s', (_description, before, after) => {
    expect(set(before)).toEqual({ ok: true, value: after });
  });

  it('writes the value as a JSON string', () => {
    const result = setConfigString('{}', 'name', 'a "quoted" \\ name');
    expect(result.ok && JSON.parse(result.value)).toEqual({ name: 'a "quoted" \\ name' });
  });

  it.each([
    ['not JSON', '{ "a": '],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['empty', ''],
  ])('refuses %s', (_description, text) => {
    expect(set(text)).toMatchObject({ ok: false, error: { code: 'workspace.config-invalid' } });
  });
});
