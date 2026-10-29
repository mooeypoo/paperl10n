// SPDX-License-Identifier: GPL-3.0-or-later
// A CodeMirror 6 editor over one Markdown file: the app's dialect, the bidi rules, and the file's
// own bytes (BOM, line endings) kept for saving. Vue-free, so a component only mounts it.
//
// It lives in a shadow root. CodeMirror injects its base styles at run time, as a <style> element
// in a document (which the production CSP, `style-src 'self'`, rightly blocks) but as a constructed
// stylesheet in a shadow root (which CSP doesn't govern). So the CSP stays strict, and the editor's
// own styles join it there as another constructed sheet.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import editorStyles from './markdown-editor.css?inline';
import { fileText, openFileText } from './file-text.ts';
import { markdownDecorations } from './markdown-decorations.ts';
import { markdownLanguage } from './markdown-language.ts';
import { isDirty, markSaved, savePointChanged, savePointExtension } from './save-point.ts';

export interface MarkdownEditorOptions {
  /** The file's exact text. */
  readonly file: string;
  readonly mdx: boolean;
  readonly readOnly: boolean;
  /** The text's language and direction (the pane's), for the editable area. */
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
  /** The accessible name of the editable area. */
  readonly label: string;
  /** The text is what the file holds (false for a new translation, unsaved until saved). */
  readonly saved: boolean;
  /** Called when the document starts or stops having unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Called after each edit (after `onDirtyChange`). */
  readonly onChange?: () => void;
}

/** The text to save, and a way to record it as saved once the save succeeded. */
export interface EditorSnapshot {
  readonly text: string;
  /** Edits made after the snapshot stay unsaved. */
  markSaved(): void;
}

export interface MarkdownEditor {
  readonly view: EditorView;
  /** The document as file text, ready to save. */
  text(): string;
  snapshot(): EditorSnapshot;
  dirty(): boolean;
  destroy(): void;
}

export function editorState(options: MarkdownEditorOptions): EditorState {
  const opened = openFileText(options.file);
  const { onDirtyChange, onChange } = options;
  return EditorState.create({
    doc: opened.text,
    extensions: [
      opened.extension,
      savePointExtension(options.saved),
      markdownLanguage(options.mdx),
      markdownDecorations,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      // Read-only text stays focusable, so it can be navigated and selected from the keyboard.
      // (CodeMirror marks it aria-readonly.)
      EditorState.readOnly.of(options.readOnly),
      EditorView.contentAttributes.of({
        lang: options.lang,
        dir: options.dir,
        'aria-label': options.label,
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged && !update.transactions.some(savePointChanged)) return;
        const dirty = isDirty(update.state);
        if (dirty !== isDirty(update.startState)) onDirtyChange?.(dirty);
        if (update.docChanged) onChange?.();
      }),
    ],
  });
}

/** Mounts an editor in `parent`'s shadow root (created if needed). */
export function createMarkdownEditor(
  parent: HTMLElement,
  options: MarkdownEditorOptions,
): MarkdownEditor {
  const root = parent.shadowRoot ?? parent.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(editorStyles);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  const view = new EditorView({ parent: root, root, state: editorState(options) });
  return {
    view,
    text: () => fileText(view.state),
    snapshot: () => {
      const { doc } = view.state;
      return {
        text: fileText(view.state),
        markSaved: () => {
          view.dispatch({ effects: markSaved(doc) });
        },
      };
    },
    dirty: () => isDirty(view.state),
    destroy: () => {
      view.destroy();
    },
  };
}
