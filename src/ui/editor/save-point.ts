// SPDX-License-Identifier: GPL-3.0-or-later
// Whether the document has unsaved changes: it differs from the document as last saved (or as
// read). Typing and then undoing back to the saved text leaves it clean. A new translation (a
// copy of the source, not yet a file) has no save point, so it's unsaved until saved.
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from '@codemirror/state';

const setSavePoint = StateEffect.define<Text>();

const savePoint = StateField.define<Text | null>({
  create: () => null,
  update(saved, transaction) {
    for (const effect of transaction.effects) if (effect.is(setSavePoint)) return effect.value;
    return saved;
  },
});

/** `saved`: the starting text is what the file holds. */
export function savePointExtension(saved: boolean): Extension {
  return savePoint.init((state) => (saved ? state.doc : null));
}

export function isDirty(state: EditorState): boolean {
  const saved = state.field(savePoint, false) ?? null;
  return saved === null || !state.doc.eq(saved);
}

/** Records `doc` (the document as it was sent to be saved) as saved. */
export function markSaved(doc: Text): StateEffect<Text> {
  return setSavePoint.of(doc);
}

export function savePointChanged(transaction: { effects: readonly StateEffect<unknown>[] }) {
  return transaction.effects.some((effect) => effect.is(setSavePoint));
}
