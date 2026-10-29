// SPDX-License-Identifier: GPL-3.0-or-later
// Editing a link through a form instead of its Markdown: clicking a link's chip, or Ctrl/Cmd+K,
// asks the UI to show the link's text and destination as two fields (the text in the pane's
// direction, the destination left to right). Applying the form changes only what was changed, so
// the rest of the link (a title, spacing) stays as written. The editor stays Vue-free: the UI gets
// a `LinkEdit` and answers through it.
import type { ChangeSpec, EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { linkPreviews, type LinkPreview } from './markdown-links.ts';

/** A request to edit a link, or to make one, answered once (apply, remove, or cancel). */
export interface LinkEdit {
  /** The link's text as written (Markdown), or the selected text for a new link. */
  readonly text: string;
  /** The destination (without `<` and `>`); empty for a new link. */
  readonly url: string;
  /** False for a new link. */
  readonly existing: boolean;
  /** Writes the link with this text and destination, and returns to the editor. */
  apply(text: string, url: string): void;
  /** Keeps the text and drops the link (an existing link only), and returns to the editor. */
  remove(): void;
  /** Changes nothing and returns to the editor. */
  cancel(): void;
}

/** The link at `pos`, its edges included. */
export function linkAt(state: EditorState, pos: number): LinkPreview | null {
  const line = state.doc.lineAt(pos);
  return linkPreviews(state, line.from, line.to).find((l) => l.from <= pos && pos <= l.to) ?? null;
}

function balanced(text: string, open: string, close: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === open) depth++;
    else if (character === close && --depth < 0) return false;
  }
  return depth === 0;
}

/** A destination as Markdown: in `<` `>` when it has spaces or unbalanced parentheses. */
export function linkDestination(url: string): string {
  const trimmed = url.trim();
  if (trimmed !== '' && !/[\s<>]/.test(trimmed) && balanced(trimmed, '(', ')')) return trimmed;
  return `<${trimmed.replaceAll('<', '%3C').replaceAll('>', '%3E')}>`;
}

/** Link text as Markdown: brackets escaped unless they pair up (`[a [b] c]` stays as is). */
export function linkText(text: string): string {
  return balanced(text, '[', ']') ? text : text.replace(/(?<!\\)([[\]])/g, '\\$1');
}

/** The changes that give `link` this text and destination, leaving unchanged parts as written. */
export function editLinkChanges(
  state: EditorState,
  link: LinkPreview,
  text: string,
  url: string,
): ChangeSpec[] {
  const changes: ChangeSpec[] = [];
  if (text !== state.doc.sliceString(link.textFrom, link.textTo)) {
    changes.push({ from: link.textFrom, to: link.textTo, insert: linkText(text) });
  }
  if (url.trim() !== link.url) {
    changes.push({ from: link.urlFrom, to: link.urlTo, insert: linkDestination(url) });
  }
  return changes;
}

/** The changes that drop `link`, keeping its text. */
export function unlinkChanges(link: LinkPreview): ChangeSpec[] {
  return [
    { from: link.from, to: link.textFrom },
    { from: link.textTo, to: link.to },
  ];
}

/** A new link as Markdown. Without text, its destination is its text. */
export function newLink(text: string, url: string): string {
  return `[${linkText(text === '' ? url.trim() : text)}](${linkDestination(url)})`;
}

function linkEdit(view: EditorView, link: LinkPreview | null): LinkEdit {
  const { state } = view;
  const { from, to } = state.selection.main;
  // The dialog is modal, so the text can't change under it; if it did (another file was loaded),
  // the request is stale and does nothing.
  const answer = (changes: () => Parameters<EditorView['dispatch']>[0] | null) => {
    if (view.state.doc === state.doc) {
      const transaction = changes();
      if (transaction !== null) view.dispatch(transaction);
    }
    view.focus();
  };
  return {
    text: link === null ? state.sliceDoc(from, to) : state.sliceDoc(link.textFrom, link.textTo),
    url: link?.url ?? '',
    existing: link !== null,
    apply: (text, url) => {
      answer(() => {
        if (link !== null) {
          const changes = editLinkChanges(state, link, text, url);
          return changes.length === 0 ? null : { changes, userEvent: 'input' };
        }
        const insert = newLink(text, url);
        return {
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          userEvent: 'input',
        };
      });
    },
    remove: () => {
      answer(() => (link === null ? null : { changes: unlinkChanges(link), userEvent: 'delete' }));
    },
    cancel: () => {
      answer(() => null);
    },
  };
}

/** Ctrl/Cmd+K and clicks on link chips ask `onEdit` to edit a link (in editable text only). */
export function linkEditing(onEdit: (edit: LinkEdit) => void): Extension {
  return [
    keymap.of([
      {
        key: 'Mod-k',
        run: (view) => {
          const { state } = view;
          if (state.readOnly) return false;
          const { from, to, head } = state.selection.main;
          const link = linkAt(state, head);
          // A new link is made from text on one line (the form's text field is one line).
          if (link === null && state.doc.lineAt(from).number !== state.doc.lineAt(to).number) {
            return false;
          }
          onEdit(linkEdit(view, link));
          return true;
        },
      },
    ]),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const chip =
          event.target instanceof Element ? event.target.closest('.cm-md-link-chip') : null;
        if (chip === null || view.state.readOnly) return false;
        const link = linkAt(view.state, view.posAtDOM(chip));
        if (link === null) return false;
        event.preventDefault();
        onEdit(linkEdit(view, link));
        return true;
      },
    }),
  ];
}
