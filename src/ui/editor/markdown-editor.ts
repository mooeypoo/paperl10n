// SPDX-License-Identifier: GPL-3.0-or-later
// A CodeMirror 6 editor over one Markdown file: the app's dialect, the bidi rules, and the file's
// own bytes (BOM, line endings) kept for saving. Vue-free, so a component only mounts it.
//
// It lives in a shadow root. CodeMirror injects its base styles at run time, as a <style> element
// in a document (which the production CSP, `style-src 'self'`, rightly blocks) but as a constructed
// stylesheet in a shadow root (which CSP doesn't govern). So the CSP stays strict, and the editor's
// own styles join it there as another constructed sheet.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import editorStyles from './markdown-editor.css?inline';
import { fileText, openFileText } from './file-text.ts';
import { markdownDecorations } from './markdown-decorations.ts';
import { markdownLanguage } from './markdown-language.ts';
import { linkEditing, type LinkEdit } from './link-editing.ts';
import { livePreview } from './live-preview.ts';
import { linkLabel } from './markdown-links.ts';
import { isDirty, markSaved, savePointChanged, savePointExtension } from './save-point.ts';
import { headingCount, sectionView, setSectionAnchors, showSections } from './section-alignment.ts';
import { sectionStatus, setSectionBars, type SectionBars } from './section-status.ts';

/** How the editable area is presented: changing it keeps the text and its history. */
export interface EditorPresentation {
  /** The text's language and direction (the pane's). */
  readonly lang: string;
  readonly dir: 'ltr' | 'rtl';
  /** The accessible name of the editable area (in the interface's language). */
  readonly label: string;
  /** The accessible name of a link chip, from its URL (in the interface's language). */
  readonly linkLabel: (url: string) => string;
}

export interface MarkdownEditorOptions extends EditorPresentation {
  /** The file's exact text. */
  readonly file: string;
  readonly mdx: boolean;
  readonly readOnly: boolean;
  /** The text is what the file holds (false for a new translation, unsaved until saved). */
  readonly saved: boolean;
  /** Called when the document starts or stops having unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Called after each edit (after `onDirtyChange`). */
  readonly onChange?: () => void;
  /** Called to edit a link through a form (Ctrl/Cmd+K, or a click on a link's chip). */
  readonly onEditLink?: (edit: LinkEdit) => void;
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
  /** Presents the same text differently (another label, say), keeping edits and undo. */
  present(presentation: EditorPresentation): void;
  /**
   * Where the page's sections start in this document, in pair order (`null` where this side lacks
   * one), set when the page opens; they follow edits from then on. `null`: not paired.
   */
  setSectionStarts(starts: readonly (number | null)[] | null): void;
  /** Shows or hides the section view's marks and spacers. */
  showSections(shown: boolean): void;
  /** Each section's status bar in the section view (`null`: none). */
  setSectionBars(bars: SectionBars | null): void;
  /** How many top-level headings of `depth` the text has now (`null`: not parsed that far). */
  headingCount(depth: number): number | null;
  destroy(): void;
}

const presentation = new Compartment();
const presented = ({ lang, dir, label, linkLabel: describeLink }: EditorPresentation) => [
  EditorView.contentAttributes.of({ lang, dir, 'aria-label': label }),
  linkLabel.of(describeLink),
];

export function editorState(options: MarkdownEditorOptions): EditorState {
  const opened = openFileText(options.file);
  const { onDirtyChange, onChange, onEditLink } = options;
  return EditorState.create({
    doc: opened.text,
    extensions: [
      opened.extension,
      savePointExtension(options.saved),
      markdownLanguage(options.mdx),
      markdownDecorations,
      livePreview,
      sectionView,
      sectionStatus,
      linkEditing((edit) => onEditLink?.(edit)),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      // Read-only text stays focusable, so it can be navigated and selected from the keyboard.
      // (CodeMirror marks it aria-readonly.)
      EditorState.readOnly.of(options.readOnly),
      presentation.of(presented(options)),
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
    present: (next) => {
      view.dispatch({ effects: presentation.reconfigure(presented(next)) });
    },
    setSectionStarts: (starts) => {
      view.dispatch({ effects: setSectionAnchors.of(starts) });
    },
    setSectionBars: (bars) => {
      view.dispatch({ effects: setSectionBars.of(bars) });
    },
    showSections: (on) => {
      view.dispatch({ effects: showSections.of(on) });
    },
    headingCount: (depth) => headingCount(view.state, depth),
    destroy: () => {
      view.destroy();
    },
  };
}
