// SPDX-License-Identifier: GPL-3.0-or-later
import { history, redo, undo } from '@codemirror/commands';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { fileText, openFileText, usualEnding } from './file-text.ts';

const open = (file: string) => {
  const opened = openFileText(file);
  return EditorState.create({ doc: opened.text, extensions: [opened.extension] });
};
const edit = (file: string, ...specs: ((state: EditorState) => TransactionSpec)[]) => {
  let state = open(file);
  for (const spec of specs) state = state.update(spec(state)).state;
  return fileText(state);
};

describe('fileText', () => {
  it.each([
    ['an empty file', ''],
    ['one line without a line ending', 'a'],
    ['LF', '# Title\n\nText\n'],
    ['CRLF', '# Title\r\n\r\nText\r\n'],
    ['CR', '# Title\r\rText\r'],
    ['mixed endings', 'a\r\nb\nc\r\nd\re'],
    ['a BOM and CRLF', '\uFEFF---\r\ntitle: x\r\n---\r\n'],
    ['no final line ending', '# Title\r\n\r\nlast line'],
    ['only line breaks', '\n\r\n\r\n\n'],
    ['Hebrew, an RLM, and emoji', '‏שלום 😀\r\nעולם\n'],
  ])('gives back %s byte for byte when nothing was edited', (_description, file) => {
    expect(fileText(open(file))).toBe(file);
  });

  it('never shows the BOM in the editor, so it cannot be deleted by accident', () => {
    const state = open('\uFEFF# Title\n');
    expect(state.doc.toString()).toBe('# Title\n');
    expect(edit('\uFEFF# Title\n', () => ({ changes: { from: 0, to: 2 } }))).toBe('\uFEFFTitle\n');
  });

  it('changes only the typed characters', () => {
    expect(edit('ab\r\ncd\r\n', () => ({ changes: { from: 1, insert: 'X' } }))).toBe(
      'aXb\r\ncd\r\n',
    );
  });

  it("gives new lines the file's usual ending, however they were typed or pasted", () => {
    const enter = (state: EditorState) => ({
      changes: { from: state.doc.line(1).to, insert: state.lineBreak },
    });
    expect(edit('a\r\nb\r\n', enter)).toBe('a\r\n\r\nb\r\n');
    expect(edit('a\rb\r', enter)).toBe('a\r\rb\r');
    expect(edit('a\r\nb\r\n', () => ({ changes: { from: 0, insert: 'x\ny\r\nz' } }))).toBe(
      'x\r\ny\r\nza\r\nb\r\n',
    );
  });

  it('keeps an unusual ending on its line when that line is edited', () => {
    // Usual ending LF; line 1 ends with CRLF.
    const file = 'one\r\ntwo\nthree\n';
    expect(edit(file, () => ({ changes: { from: 3, insert: '!' } }))).toBe('one!\r\ntwo\nthree\n');
    expect(edit(file, () => ({ changes: { from: 0, to: 3, insert: '1' } }))).toBe(
      '1\r\ntwo\nthree\n',
    );
    // A line inserted above it doesn't take or move its ending.
    expect(edit(file, () => ({ changes: { from: 0, insert: 'zero\n' } }))).toBe(
      'zero\none\r\ntwo\nthree\n',
    );
  });

  it('drops an unusual ending with its line break, and keeps the others', () => {
    const file = 'a\r\nb\nc\r\nd\n';
    // Join lines a and b: the CRLF after a is gone; c's CRLF stays.
    expect(edit(file, () => ({ changes: { from: 1, to: 2 } }))).toBe('ab\nc\r\nd\n');
  });

  it('brings an unusual ending back when the edit that deleted it is undone, and redone', () => {
    const file = 'a\r\nb\nc\r\nd\n';
    const opened = openFileText(file);
    let state = EditorState.create({ doc: opened.text, extensions: [opened.extension, history()] });
    const run = (command: typeof undo) =>
      command({ state, dispatch: (transaction) => (state = transaction.state) });
    // Delete from the end of a up to c's line break: a's CRLF goes, c's CRLF stays.
    state = state.update({ changes: { from: 1, to: 5 } }).state;
    expect(fileText(state)).toBe('a\r\nd\n');
    run(undo);
    expect(fileText(state)).toBe(file);
    run(redo);
    expect(fileText(state)).toBe('a\r\nd\n');
    run(undo);
    expect(fileText(state)).toBe(file);
  });

  it('matches the same edits made to the file itself (seeded random insertions)', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const breaks = ['\n', '\r\n', '\r'];
    for (let round = 0; round < 50; round++) {
      let file = random(2) === 0 ? '\uFEFF' : '';
      for (let line = 0; line < 1 + random(8); line++) {
        file += 'אבג xyz'.slice(0, random(7)) + (breaks[random(3)] ?? '\n');
      }
      if (random(2) === 0) file += 'tail';
      let state = open(file);
      for (let step = 0; step < 10; step++) {
        const at = random(state.doc.length + 1);
        state = state.update({ changes: { from: at, insert: 'Q' } }).state;
        // The same insertion in the file: after the BOM, with each earlier CRLF one longer.
        const bom = file.startsWith('\uFEFF') ? 1 : 0;
        let raw = bom;
        for (let editor = 0; editor < at; editor++) raw += file.startsWith('\r\n', raw) ? 2 : 1;
        file = file.slice(0, raw) + 'Q' + file.slice(raw);
        expect(fileText(state)).toBe(file);
      }
    }
  });

  it('falls back to the plain document for a state opened without it', () => {
    expect(fileText(EditorState.create({ doc: 'a\r\nb' }))).toBe('a\nb');
  });
});

describe('usualEnding', () => {
  it.each<[string, string, string]>([
    ['no line breaks', 'abc', '\n'],
    ['mostly CRLF', 'a\r\nb\r\nc\n', '\r\n'],
    ['mostly CR', 'a\rb\rc\n', '\r'],
    ['a tie with LF', 'a\r\nb\n', '\n'],
  ])('is LF or the most common ending: %s', (_description, file, expected) => {
    expect(usualEnding(file)).toBe(expected);
  });
});
