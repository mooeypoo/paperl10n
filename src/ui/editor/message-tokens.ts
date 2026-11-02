// SPDX-License-Identifier: GPL-3.0-or-later
// A message's tokens in the editor (`$1`, `{{PLURAL:…}}`, links, tags), as main found them
// (docs/plan/M4-catalogs.md, question 6: the syntax is the plugin's, so the renderer never reads
// it). Each is marked by kind, and each top-level one is an isolated left-to-right run, as in the
// list's rows, so a Hebrew sentence can't scatter it. Edits move the marks along until main's
// next answer replaces them.
import type { PlaceholderTokenDto } from '#ipc-contract';
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, Direction, EditorView, type DecorationSet } from '@codemirror/view';
import { topLevelTokens } from '../catalog/token-segments.ts';

interface TokenMarks {
  readonly marks: DecorationSet;
  readonly isolates: DecorationSet;
}

/** The tokens of the editor's text as it is now, in main's order. */
export const setMessageTokens = StateEffect.define<readonly PlaceholderTokenDto[]>();

const isolate = Decoration.mark({
  bidiIsolate: Direction.LTR,
  attributes: { dir: 'ltr' },
  class: 'cm-msg-isolate',
});
const tokenMark = (kind: PlaceholderTokenDto['kind']) =>
  Decoration.mark({ class: `cm-msg-token cm-msg-${kind}` });

function tokenMarks(text: string, tokens: readonly PlaceholderTokenDto[]): TokenMarks {
  const marks: Range<Decoration>[] = tokens
    .filter((token) => token.start < token.end && token.end <= text.length)
    .map((token) => tokenMark(token.kind).range(token.start, token.end));
  return {
    marks: Decoration.set(marks, true),
    isolates: Decoration.set(
      topLevelTokens(text, tokens).map((token) => isolate.range(token.start, token.end)),
      true,
    ),
  };
}

const messageTokens = StateField.define<TokenMarks>({
  create: () => ({ marks: Decoration.none, isolates: Decoration.none }),
  update(value, transaction) {
    let next = transaction.docChanged
      ? {
          marks: value.marks.map(transaction.changes),
          isolates: value.isolates.map(transaction.changes),
        }
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(setMessageTokens)) {
        next = tokenMarks(transaction.state.doc.toString(), effect.value);
      }
    }
    return next;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.marks),
    EditorView.decorations.from(field, (value) => value.isolates),
    EditorView.bidiIsolatedRanges.from(field, (value) => value.isolates),
  ],
});

/** Marks a message's tokens, set with `setMessageTokens`. */
export const messageTokenMarks = [messageTokens];

/** The marked tokens now, in order: where each is, its kind, and whether it's isolated. */
export function markedTokens(state: EditorState): {
  readonly from: number;
  readonly to: number;
  readonly kind: string;
  readonly isolated: boolean;
}[] {
  const { marks, isolates } = state.field(messageTokens);
  const isolated = new Set<string>();
  isolates.between(0, state.doc.length, (from, to) => {
    isolated.add(`${String(from)}:${String(to)}`);
  });
  const found: { from: number; to: number; kind: string; isolated: boolean }[] = [];
  marks.between(0, state.doc.length, (from, to, mark) => {
    const kind =
      /cm-msg-(?!token)(\S+)/.exec((mark.spec as { readonly class?: string }).class ?? '')?.[1] ??
      '';
    found.push({ from, to, kind, isolated: isolated.has(`${String(from)}:${String(to)}`) });
  });
  return found;
}
