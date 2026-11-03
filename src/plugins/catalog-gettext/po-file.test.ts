// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { headerField, headerOf, readPo, readQuoted } from './po-file.ts';

function read(text: string) {
  const result = readPo(text);
  if (!result.ok) throw new Error(`test setup: ${result.reason}`);
  return result.file;
}

describe('readQuoted', () => {
  it.each<[string, string]>([
    ['""', ''],
    ['"plain"', 'plain'],
    [String.raw`"a\nb\tc\\d\"e"`, 'a\nb\tc\\d"e'],
    [String.raw`"\a\b\f\v\r\?\'"`, "\u0007\b\f\v\r?'"],
    [String.raw`"\101\x42"`, 'AB'],
    ['  "spaced"  ', 'spaced'],
    ['"עברית 🦁"', 'עברית 🦁'],
  ])('reads %s', (raw, value) => {
    expect(readQuoted(raw)).toBe(value);
  });

  it.each(['', '"', 'plain', '"open', 'closed"', '"a"b"', String.raw`"\"`, String.raw`"\q"`])(
    'refuses %j',
    (raw) => {
      expect(readQuoted(raw)).toBeNull();
    },
  );
});

describe('readPo', () => {
  it('reads every part of an entry, and where its msgstr is', () => {
    const text = [
      '# A translator',
      '#. For translators',
      '#. on two lines',
      '#: src/a.c:1 src/b.c:2',
      '#, fuzzy, c-format',
      '#| msgid "Old %s"',
      'msgctxt "menu"',
      'msgid "New "',
      '"%s"',
      'msgid_plural "News %s"',
      'msgstr[0] "חדש %s"',
      'msgstr[1] "חדשים "',
      '"%s"',
      '',
    ].join('\n');
    const [entry] = read(text).entries;
    expect(entry).toMatchObject({
      start: 0,
      end: text.length,
      translatorComments: [' A translator'],
      extractedComments: ['For translators', 'on two lines'],
      flags: ['fuzzy', 'c-format'],
      previousMsgid: 'Old %s',
      msgctxt: 'menu',
      msgid: 'New %s',
      msgidPlural: 'News %s',
      msgstr: ['חדש %s', 'חדשים %s'],
      obsolete: false,
    });
    expect(text.slice(entry?.msgstrStart, entry?.msgstrEnd)).toBe(
      'msgstr[0] "חדש %s"\nmsgstr[1] "חדשים "\n"%s"\n',
    );
  });

  it('reads a previous msgid on several lines', () => {
    const [entry] = read(
      '#, fuzzy\n#| msgid ""\n#| "Old "\n#| "text"\nmsgid "New"\nmsgstr "x"\n',
    ).entries;
    expect(entry?.previousMsgid).toBe('Old text');
  });

  it('separates entries without blank lines, and keeps comments alone out of them', () => {
    const file = read(
      '# orphan comment\n\nmsgid "a"\nmsgstr "A"\nmsgid "b"\nmsgstr "B"\n#. c\nmsgid "c"\nmsgstr "C"',
    );
    expect(file.entries.map((e) => [e.msgid, e.msgstr[0]])).toEqual([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ]);
    expect(file.entries[2]?.end).toBe(file.text.length);
  });

  it('reads obsolete entries, with their comments, as obsolete', () => {
    const file = read(
      'msgid "a"\nmsgstr "A"\n\n# kept\n#~ msgid "old"\n#~ msgstr "ישן"\n#~| msgid "older"\n',
    );
    expect(file.entries.map((e) => [e.msgid, e.obsolete])).toEqual([
      ['a', false],
      ['old', true],
    ]);
  });

  it('keeps CRLF line ends out of the lines, and finds the line break', () => {
    const file = read('msgid "a"\r\nmsgstr "A"\r\n');
    expect(file.lineBreak).toBe('\r\n');
    expect(file.entries[0]?.msgstr).toEqual(['A']);
    expect(read('').lineBreak).toBe('\n');
  });

  it('finds the header and its fields', () => {
    const file = read(
      'msgid ""\nmsgstr ""\n"Language: he\\n"\n"Plural-Forms: nplurals=3; plural=n;\\n"\n\nmsgctxt "x"\nmsgid ""\nmsgstr "not the header"\n',
    );
    const header = headerOf(file);
    expect(header?.msgctxt).toBeUndefined();
    expect(headerField(header, 'language')).toBe('he');
    expect(headerField(header, 'Plural-Forms')).toBe('nplurals=3; plural=n;');
    expect(headerField(header, 'Missing')).toBeUndefined();
    expect(headerOf(read('msgid "a"\nmsgstr "A"\n'))).toBeUndefined();
    // An obsolete entry is never the header, even with an empty msgid.
    const withObsolete = read(
      '#~ msgid ""\n#~ msgstr "Language: x\\n"\n\nmsgid ""\nmsgstr "Language: he\\n"\n',
    );
    expect(headerField(headerOf(withObsolete), 'Language')).toBe('he');
  });

  it.each<[string, string, string]>([
    ['msgid without msgstr', 'msgid "a"\n\n', 'msgid without msgstr'],
    ['msgstr without msgid', 'msgstr "a"\n', 'msgstr without msgid'],
    ['a malformed string', 'msgid "a\nmsgstr ""\n', 'a malformed string'],
    ['text that is not PO', 'hello\n', 'not a PO line'],
    ['a stray continuation', '"a"\n', 'not a PO line'],
    [
      'msgstr in a plural entry',
      'msgid "a"\nmsgid_plural "b"\nmsgstr "c"\n',
      'msgstr in a plural entry',
    ],
    [
      'msgstr[N] without msgid_plural',
      'msgid "a"\nmsgstr[0] "c"\n',
      'msgstr[N] without msgid_plural',
    ],
    [
      'forms out of order',
      'msgid "a"\nmsgid_plural "b"\nmsgstr[1] "c"\n',
      'msgstr[1] out of order',
    ],
    ['a second msgstr', 'msgid "a"\nmsgstr "b"\nmsgstr "c"\n', 'a second msgstr'],
    ['a second msgid', 'msgid "a"\nmsgid "b"\nmsgstr "c"\n', 'a second msgid'],
    ['msgctxt after msgid', 'msgid "a"\nmsgctxt "b"\nmsgstr "c"\n', 'msgctxt after msgid'],
    [
      'msgid_plural before msgid',
      'msgid_plural "a"\nmsgid "b"\nmsgstr "c"\n',
      'msgid_plural before msgid',
    ],
    [
      'obsolete and live lines mixed',
      'msgid "a"\n#~ msgstr "b"\n',
      'obsolete and live lines in one entry',
    ],
  ])('refuses %s', (_description, text, reason) => {
    const result = readPo(text);
    expect(result.ok ? 'ok' : result.reason).toContain(reason);
  });
});
