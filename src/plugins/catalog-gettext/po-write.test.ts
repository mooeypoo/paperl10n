// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { projectPath } from '#plugin-api';
import { openFixture } from '#plugin-api/testing';
import { readPo, type PoFile } from './po-file.ts';
import { formatField, newPo, patchPo, type PoChange } from './po-write.ts';

const sideBySide = await openFixture(new URL('./fixtures/side-by-side', import.meta.url).pathname);
async function fixture(path: string): Promise<string> {
  const at = projectPath(path);
  const text = at.ok ? await sideBySide.readText(at.value) : null;
  if (text?.ok !== true) throw new Error(`test setup: ${path}`);
  return text.value;
}

function read(text: string): PoFile {
  const result = readPo(text);
  if (!result.ok) throw new Error(`test setup: ${result.reason}`);
  return result.file;
}

const template = read(await fixture('po/lantern.pot'));
const hebrew = read(await fixture('po/he.po'));
const patch = (target: PoFile, ...changes: PoChange[]) => patchPo(target, template, changes, 3);
const set = (key: string, ...forms: string[]): PoChange => ({ kind: 'set', key, forms });
const remove = (key: string): PoChange => ({ kind: 'remove', key });

/** The lines that differ, as `-` and `+` (a small line diff, enough for these files). */
function changedLines(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [...a.slice(start, endA).map((l) => `-${l}`), ...b.slice(start, endB).map((l) => `+${l}`)];
}

describe('formatField', () => {
  it.each<[string, string, string[]]>([
    ['an empty string', '', ['msgstr ""']],
    ['a short string', 'Hello', ['msgstr "Hello"']],
    ['escapes', 'a "b" \\ \t\r\u0007\b\f\v', [String.raw`msgstr "a \"b\" \\ \t\r\a\b\f\v"`]],
    ['a line break at the end only', 'Line\n', [String.raw`msgstr "Line\n"`]],
    ['a line break inside', 'One\nTwo', ['msgstr ""', String.raw`"One\n"`, '"Two"']],
    ['two at the end', 'One\n\n', ['msgstr ""', String.raw`"One\n"`, String.raw`"\n"`]],
    [
      'a long string, broken after spaces at 79 columns',
      `${'word '.repeat(20)}end`,
      ['msgstr ""', `"${'word '.repeat(15)}"`, `"${'word '.repeat(5)}end"`],
    ],
    ['one long word, left whole', 'x'.repeat(90), ['msgstr ""', `"${'x'.repeat(90)}"`]],
  ])('writes %s', (_description, value, lines) => {
    expect(formatField('msgstr', value)).toEqual(lines);
  });

  it('counts the whole line: the keyword, the prefix, and both quotes', () => {
    // 79 columns exactly fit on one line; 80 don't.
    const fits = 'x'.repeat(79 - 'msgstr ""'.length);
    expect(formatField('msgstr', fits)).toEqual([`msgstr "${fits}"`]);
    expect(formatField('msgstr', `${fits} y`)).toEqual(['msgstr ""', `"${fits} y"`]);
    const obsolete = formatField('msgstr', `${'word '.repeat(15)}end`, '#~ ');
    expect(obsolete[0]).toBe('#~ msgstr ""');
    expect(obsolete.every((line) => line.startsWith('#~ ') && line.length <= 79)).toBe(true);
  });

  it('fills a line to exactly 79 columns, and keeps a run of spaces with the word before it', () => {
    // 77 columns between the quotes, then the next word.
    const full = `${'x'.repeat(71)} abcd `;
    expect(formatField('msgstr', `${full}next`)).toEqual(['msgstr ""', `"${full}"`, '"next"']);
    const spaces = `${'x'.repeat(76)}  `;
    expect(formatField('msgstr', `${spaces}y`)).toEqual(['msgstr ""', `"${spaces}"`, '"y"']);
  });

  it('counts characters, not UTF-16 units or bytes', () => {
    const hebrew = 'ש'.repeat(79 - 'msgstr ""'.length);
    expect(formatField('msgstr', hebrew)).toHaveLength(1);
    expect(formatField('msgstr', '🦁'.repeat(70))).toHaveLength(1);
  });
});

describe('patchPo', () => {
  it('changes only the msgstr of a message that changes', () => {
    expect(changedLines(hebrew.text, patch(hebrew, set('Light %s', 'הדליקו %s')))).toEqual([
      '-msgstr "הדליקו את %s"',
      '+msgstr "הדליקו %s"',
    ]);
  });

  it('clears a fuzzy flag and its previous msgid, even when the text stays', () => {
    expect(changedLines(hebrew.text, patch(hebrew, set('Lantern', 'פנסים')))).toEqual([
      '-#, fuzzy',
      '-#| msgid "Lanterns"',
    ]);
  });

  it('keeps the other flags when it drops fuzzy', () => {
    const text = '#, fuzzy, c-format\nmsgid "%s"\nmsgstr "%s!"\n';
    expect(patchPo(read(text), read('msgid "%s"\nmsgstr ""\n'), [set('%s', '%s?')], 2)).toBe(
      '#, c-format\nmsgid "%s"\nmsgstr "%s?"\n',
    );
  });

  it('clears a fuzzy flag without a previous msgid, even when the text stays', () => {
    const text = '#, fuzzy\nmsgid "a"\nmsgstr "A"\n';
    expect(patchPo(read(text), read('msgid "a"\nmsgstr ""\n'), [set('a', 'A')], 2)).toBe(
      'msgid "a"\nmsgstr "A"\n',
    );
  });

  it('writes nothing for a message set to what it already says', () => {
    expect(patch(hebrew, set('Light %s', 'הדליקו את %s'))).toBe(hebrew.text);
    expect(patch(hebrew, remove('Not in the file'))).toBe(hebrew.text);
  });

  it('writes every plural form, and wraps a long translation as msgmerge does', () => {
    const long = `${'מנורה '.repeat(20)}%d`;
    const changed = changedLines(
      hebrew.text,
      patch(hebrew, set('%d lamp is lit', 'אחת', 'שתיים', long)),
    );
    expect(changed).toEqual([
      '-msgstr[0] "מנורה אחת דולקת"',
      '-msgstr[1] "שתי מנורות דולקות"',
      '-msgstr[2] "%d מנורות דולקות"',
      '+msgstr[0] "אחת"',
      '+msgstr[1] "שתיים"',
      '+msgstr[2] ""',
      `+"${'מנורה '.repeat(12)}"`,
      `+"${'מנורה '.repeat(8)}%d"`,
    ]);
  });

  it('keeps the other plural forms when given only the first, and pads a new one', () => {
    expect(changedLines(hebrew.text, patch(hebrew, set('%d lamp is lit', 'אחת')))).toEqual([
      '-msgstr[0] "מנורה אחת דולקת"',
      '+msgstr[0] "אחת"',
    ]);
    const added = patchPo(read(''), template, [set('%d lamp is lit', 'אחת')], 3);
    expect(added).toContain('msgstr[0] "אחת"\nmsgstr[1] ""\nmsgstr[2] ""\n');
    expect(newPo(template, 'he', 'x', 3, [set('%d lamp is lit', 'אחת')])).toContain(
      'msgstr[0] "אחת"\nmsgstr[1] ""\nmsgstr[2] ""\n',
    );
  });

  it('adds a message from the template after the nearest one before it, with its comments', () => {
    const added = patch(hebrew, set('menu\u0004Open', 'פתיחה'));
    expect(changedLines(hebrew.text, added)).toEqual([
      '+#. Shown in the menu bar and in a button.',
      '+#: src/menu.c:12 src/toolbar.c:40',
      '+msgctxt "menu"',
      '+msgid "Open"',
      '+msgstr "פתיחה"',
      '+',
    ]);
    expect(added.indexOf('msgid "Open"')).toBeGreaterThan(added.indexOf('msgid "Light %s"'));
  });

  it('empties a message the template still has, and makes one it dropped obsolete', () => {
    expect(changedLines(hebrew.text, patch(hebrew, remove('Light %s')))).toEqual([
      '-msgstr "הדליקו את %s"',
      '+msgstr ""',
    ]);
    // Its translator comment stays; where it was used doesn't.
    expect(changedLines(hebrew.text, patch(hebrew, remove('Dim')))).toEqual([
      '-#: src/main.c:44',
      '-msgid "Dim"',
      '-msgstr "עמעום"',
      '+#~ msgid "Dim"',
      '+#~ msgstr "עמעום"',
    ]);
  });

  it('keeps CRLF and a missing final line break', async () => {
    const portuguese = read(await fixture('po/pt_BR.po'));
    const changed = patchPo(portuguese, template, [set('%d lamp is lit', 'uma', 'muitas')], 2);
    expect(changed.endsWith('msgstr[1] "muitas"')).toBe(true);
    expect(changed.replace(/\r\n/g, '')).not.toContain('\n');
    const added = patchPo(portuguese, template, [set('Light %s', 'Acender %s')], 2);
    expect(added.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('adds after the last message of a file without a final line break', () => {
    const text = 'msgid "Lantern"\nmsgstr "L"';
    expect(patchPo(read(text), template, [set('%d lamp is lit', 'a', 'b')], 2)).toBe(
      `${text}\n\n#: src/main.c:58\n#, c-format\nmsgid "%d lamp is lit"\nmsgid_plural "%d lamps are lit"\nmsgstr[0] "a"\nmsgstr[1] "b"`,
    );
  });

  it('adds first, after the header or at the start, when nothing before it is there', () => {
    const header = 'msgid ""\nmsgstr "Language: he\\n"\n';
    expect(patchPo(read(header), template, [set('Lantern', 'L')], 3)).toBe(
      `${header}\n#. The window's title.\n#: src/main.c:20\nmsgid "Lantern"\nmsgstr "L"\n`,
    );
    expect(patchPo(read('msgid "Dim"\nmsgstr "D"\n'), template, [set('Lantern', 'L')], 3)).toBe(
      `#. The window's title.\n#: src/main.c:20\nmsgid "Lantern"\nmsgstr "L"\n\nmsgid "Dim"\nmsgstr "D"\n`,
    );
    expect(patchPo(read(''), template, [set('Lantern', 'L')], 3)).toBe(
      `#. The window's title.\n#: src/main.c:20\nmsgid "Lantern"\nmsgstr "L"\n`,
    );
  });

  it('adds a message the template lacks, with its context', () => {
    expect(patchPo(read(''), template, [set('x\u0004New', 'חדש')], 3)).toBe(
      'msgctxt "x"\nmsgid "New"\nmsgstr "חדש"\n',
    );
  });
});

describe('newPo', () => {
  it('writes the template with a header for the language, every entry in order', () => {
    const written = newPo(template, 'he', 'nplurals=3; plural=n;', 3, [
      set('%d lamp is lit', 'א', 'ב', 'ג'),
      set('Lantern', 'פנס'),
      remove('Lantern'),
      set('Light %s', 'הדליקו %s'),
    ]);
    expect(written).toBe(
      [
        "# Lantern's translations.",
        '# Copyright (C) 2026 The Lantern authors',
        '# This file is distributed under the same license as the lantern package.',
        '# FIRST AUTHOR <EMAIL@ADDRESS>, YEAR.',
        '#',
        'msgid ""',
        'msgstr ""',
        String.raw`"Project-Id-Version: lantern 1.0\n"`,
        String.raw`"Report-Msgid-Bugs-To: \n"`,
        String.raw`"POT-Creation-Date: 2026-10-01 12:00+0000\n"`,
        String.raw`"PO-Revision-Date: \n"`,
        String.raw`"Last-Translator: \n"`,
        String.raw`"Language-Team: LANGUAGE <LL@li.org>\n"`,
        String.raw`"Language: he\n"`,
        String.raw`"MIME-Version: 1.0\n"`,
        String.raw`"Content-Type: text/plain; charset=UTF-8\n"`,
        String.raw`"Content-Transfer-Encoding: 8bit\n"`,
        String.raw`"Plural-Forms: nplurals=3; plural=n;\n"`,
        '',
        "#. The window's title.",
        '#: src/main.c:20',
        'msgid "Lantern"',
        'msgstr ""',
        '',
        '#: src/main.c:31',
        '#, c-format',
        'msgid "Light %s"',
        'msgstr "הדליקו %s"',
        '',
        '#. Shown in the menu bar and in a button.',
        '#: src/menu.c:12 src/toolbar.c:40',
        'msgctxt "menu"',
        'msgid "Open"',
        'msgstr ""',
        '',
        '#: src/help.c:7',
        'msgid ""',
        '"Lantern lights up your documents. Press the switch to turn a lamp on, and "',
        String.raw`"press it again to turn it off.\n"`,
        '"Lamps stay lit until you close the window."',
        'msgstr ""',
        '',
        '#: src/main.c:58',
        '#, c-format',
        'msgid "%d lamp is lit"',
        'msgid_plural "%d lamps are lit"',
        'msgstr[0] "א"',
        'msgstr[1] "ב"',
        'msgstr[2] "ג"',
        '',
      ].join('\n'),
    );
  });

  it('copies a source entry without its review mark or previous msgid', () => {
    const source = read('#. Docs\n#, fuzzy, c-format\n#| msgid "old"\nmsgid "%s"\nmsgstr "%s"\n');
    expect(newPo(source, 'he', 'x', 3, [])).toContain(
      '#. Docs\n#, c-format\nmsgid "%s"\nmsgstr ""\n',
    );
  });

  it('sets header fields whatever case the template wrote them in', () => {
    const source = read(
      'msgid ""\nmsgstr ""\n"language: \\n"\n"content-type: text/plain; charset=CHARSET\\n"\n',
    );
    expect(newPo(source, 'he', 'x', 3, [])).toBe(
      [
        'msgid ""',
        'msgstr ""',
        String.raw`"language: he\n"`,
        String.raw`"content-type: text/plain; charset=UTF-8\n"`,
        String.raw`"Plural-Forms: x\n"`,
        '',
      ].join('\n'),
    );
  });

  it('adds the header fields a template lacks, and writes one without a header', () => {
    const bare = read('msgid "a"\nmsgid_plural "as"\nmsgstr[0] ""\nmsgstr[1] ""\n');
    expect(newPo(bare, 'ar', 'nplurals=6; plural=n;', 6, [])).toBe(
      [
        'msgid ""',
        'msgstr ""',
        String.raw`"Language: ar\n"`,
        String.raw`"Content-Type: text/plain; charset=UTF-8\n"`,
        String.raw`"Plural-Forms: nplurals=6; plural=n;\n"`,
        '',
        'msgid "a"',
        'msgid_plural "as"',
        ...Array.from({ length: 6 }, (_, i) => `msgstr[${String(i)}] ""`),
        '',
      ].join('\n'),
    );
  });
});
