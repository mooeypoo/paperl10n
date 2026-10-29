// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps a file's bytes through the editor. CodeMirror splits lines on any line break and joins
// them with one separator, and it would keep a BOM as an invisible character the caret can delete.
// So the editor gets the text without a BOM, and a state field remembers the BOM, the file's usual
// line ending, and every line that ends differently; `fileText` puts them back. An untouched
// document comes back byte for byte, and an edit changes only the characters it touched.
import { invertedEffects } from '@codemirror/commands';
import {
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';

export type LineEnding = '\n' | '\r\n' | '\r';

const BOM = '\uFEFF';
const LINE_BREAK = /\r\n|\r|\n/g;

/** A line whose ending differs from the file's usual one. It sits at the end of its line and
 * stays after text typed there (start side 1). */
class Ending extends RangeValue {
  readonly ending: LineEnding;
  constructor(ending: LineEnding) {
    super();
    this.ending = ending;
  }
  override startSide = 1;
  override endSide = 1;
  override point = true;
  override eq(other: RangeValue): boolean {
    return other instanceof Ending && other.ending === this.ending;
  }
}

interface FileShape {
  readonly bom: boolean;
  readonly usual: LineEnding;
  readonly exceptions: RangeSet<Ending>;
}

const plainShape: FileShape = { bom: false, usual: '\n', exceptions: RangeSet.of<Ending>([]) };

interface EndingAt {
  readonly position: number;
  readonly ending: LineEnding;
}

/** Puts unusual endings back, for undo: history replays it with the edit that removed them. */
const restoreEndings = StateEffect.define<readonly EndingAt[]>({
  map: (endings, mapping) =>
    endings.map(({ position, ending }) => ({ position: mapping.mapPos(position, 1), ending })),
});

const fileShape = StateField.define<FileShape>({
  create: () => plainShape,
  update(shape, transaction) {
    let exceptions = transaction.docChanged
      ? shape.exceptions.map(transaction.changes)
      : shape.exceptions;
    for (const effect of transaction.effects) {
      if (!effect.is(restoreEndings)) continue;
      exceptions = exceptions.update({
        add: effect.value.map(({ position, ending }) => new Ending(ending).range(position)),
        sort: true,
      });
    }
    return exceptions === shape.exceptions ? shape : { ...shape, exceptions };
  },
});

/** The unusual endings whose line break this edit deletes, at their positions before it (which
 * is where undoing the edit puts the break back). */
function deletedEndings(transaction: Transaction): EndingAt[] {
  const shape = transaction.startState.field(fileShape, false);
  if (shape === undefined || !transaction.docChanged) return [];
  const deleted: EndingAt[] = [];
  transaction.changes.iterChangedRanges((from, to) => {
    shape.exceptions.between(from, to, (position, _end, value) => {
      // The break is the character after the exception: deleted when it's inside the change.
      if (position >= from && position < to) deleted.push({ position, ending: value.ending });
    });
  });
  return deleted;
}

const undoableEndings = invertedEffects.of((transaction) => {
  const deleted = deletedEndings(transaction);
  return deleted.length === 0 ? [] : [restoreEndings.of(deleted)];
});

/** The most common line ending: `\n` when there are none, or on a tie with it. */
export function usualEnding(file: string): LineEnding {
  const counts: Record<LineEnding, number> = { '\n': 0, '\r\n': 0, '\r': 0 };
  for (const match of file.matchAll(LINE_BREAK)) counts[match[0] as LineEnding]++;
  let usual: LineEnding = '\n';
  for (const ending of ['\r\n', '\r'] as const) if (counts[ending] > counts[usual]) usual = ending;
  return usual;
}

/**
 * Splits a file into the editor's starting text and an extension that remembers the rest.
 * Create the state with both: `EditorState.create({ doc: opened.text, extensions: [opened.extension] })`.
 */
export function openFileText(file: string): { text: string; extension: Extension } {
  const bom = file.startsWith(BOM);
  const text = bom ? file.slice(1) : file;
  const usual = usualEnding(text);
  const exceptions = [];
  // In the editor every line break is one character, so a line ends where its break starts,
  // less one for each two-character break before it.
  let shift = 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    const ending = match[0] as LineEnding;
    if (ending !== usual) exceptions.push(new Ending(ending).range(match.index - shift));
    shift += ending.length - 1;
  }
  const shape: FileShape = { bom, usual, exceptions: RangeSet.of(exceptions) };
  return { text, extension: [fileShape.init(() => shape), undoableEndings] };
}

/** The document as file text: its BOM, line endings, and final line ending as they were. Lines
 * added in the editor take the file's usual ending. */
export function fileText(state: EditorState): string {
  const shape = state.field(fileShape, false) ?? plainShape;
  const { doc } = state;
  const parts: string[] = shape.bom ? [BOM] : [];
  const cursor = shape.exceptions.iter();
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    parts.push(line.text);
    if (number === doc.lines) break;
    // Skip exceptions an edit left inside a line (their line break was deleted).
    while (cursor.value !== null && cursor.from < line.to) cursor.next();
    parts.push(
      cursor.value !== null && cursor.from === line.to ? cursor.value.ending : shape.usual,
    );
  }
  return parts.join('');
}
