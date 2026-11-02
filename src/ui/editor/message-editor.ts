// SPDX-License-Identifier: GPL-3.0-or-later
// A CodeMirror 6 editor over one message's translation: plain text in the target's language and
// direction, with the tokens main found marked and isolated (message-tokens.ts), and keys to move
// between messages without the mouse. Vue-free, so a component only mounts it. Like the Markdown
// editor, it lives in a shadow root, so the strict CSP holds (markdown-editor.ts says why).
import type { PlaceholderTokenDto } from '#ipc-contract';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import editorStyles from './message-editor.css?inline';
import { messageTokenMarks, setMessageTokens } from './message-tokens.ts';

/** What the editor's keys do besides editing. Each returns nothing; the key is always taken. */
export interface MessageEditorCommands {
  /** Alt+Down and Alt+Up: the next or previous message. */
  readonly next: () => void;
  readonly previous: () => void;
  /** Alt+Shift+Down and Alt+Shift+Up: the next or previous message that needs work. */
  readonly nextNeedingWork: () => void;
  readonly previousNeedingWork: () => void;
  /** Escape: close the editor. */
  readonly close: () => void;
}

export interface MessageEditorOptions {
  readonly text: string;
  /** The text's tokens, as main found them (`[]`: none known yet). */
  readonly tokens: readonly PlaceholderTokenDto[];
  /** The text's language and direction (the target's). */
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
  /** The accessible name of the editable area, and what it shows while empty. */
  readonly label: string;
  readonly placeholder: string;
  /** Called after each edit, with the text. */
  readonly onChange?: (text: string) => void;
  readonly commands: MessageEditorCommands;
}

export interface MessageEditor {
  readonly view: EditorView;
  text(): string;
  /** Marks the tokens main found in `text`, if that's still the editor's text (`true`). */
  setTokens(tokens: readonly PlaceholderTokenDto[], text: string): boolean;
  focus(): void;
  destroy(): void;
}

/** The keys for moving between messages (shown in the buttons' `aria-keyshortcuts`). */
export const messageKeys = {
  next: 'Alt-ArrowDown',
  previous: 'Alt-ArrowUp',
  nextNeedingWork: 'Shift-Alt-ArrowDown',
  previousNeedingWork: 'Shift-Alt-ArrowUp',
  close: 'Escape',
} as const satisfies Record<keyof MessageEditorCommands, string>;

function commandKeys(commands: MessageEditorCommands) {
  // Above the default keymap, which moves lines with Alt+Up and Alt+Down.
  return Prec.highest(
    keymap.of(
      (Object.keys(messageKeys) as (keyof MessageEditorCommands)[]).map((name) => ({
        key: messageKeys[name],
        run: () => {
          commands[name]();
          return true;
        },
      })),
    ),
  );
}

export function messageEditorState(options: MessageEditorOptions): EditorState {
  const { onChange } = options;
  const state = EditorState.create({
    doc: options.text,
    extensions: [
      messageTokenMarks,
      commandKeys(options.commands),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      placeholder(options.placeholder),
      EditorView.contentAttributes.of({
        lang: options.lang,
        dir: options.dir,
        'aria-label': options.label,
        'aria-multiline': 'true',
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
      }),
    ],
  });
  return state.update({ effects: setMessageTokens.of(options.tokens) }).state;
}

/** Mounts an editor in `parent`'s shadow root (created if needed). */
export function createMessageEditor(
  parent: HTMLElement,
  options: MessageEditorOptions,
): MessageEditor {
  const root = parent.shadowRoot ?? parent.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(editorStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  const view = new EditorView({ parent: root, root, state: messageEditorState(options) });
  return {
    view,
    text: () => view.state.doc.toString(),
    setTokens: (tokens, text) => {
      if (view.state.doc.toString() !== text) return false;
      view.dispatch({ effects: setMessageTokens.of(tokens) });
      return true;
    },
    focus: () => {
      view.focus();
    },
    destroy: () => {
      view.destroy();
    },
  };
}
