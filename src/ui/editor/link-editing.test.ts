// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editLinkChanges,
  linkAt,
  linkDestination,
  linkEditing,
  linkText,
  newLink,
  unlinkChanges,
  type LinkEdit,
} from './link-editing.ts';
import { markdownLanguage } from './markdown-language.ts';
import { livePreview } from './live-preview.ts';

const stateOf = (text: string, readOnly = false) => {
  const state = EditorState.create({
    doc: text,
    extensions: [markdownLanguage(false), EditorState.readOnly.of(readOnly)],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
};

const firstLink = (state: EditorState) => {
  const link = linkAt(state, state.doc.toString().indexOf('['));
  if (link === null) throw new Error('test setup: no link');
  return link;
};

describe('linkDestination', () => {
  it.each([
    ['https://example.org/a?b=c#d', 'https://example.org/a?b=c#d'],
    ['./guide.md', './guide.md'],
    ['  /a  ', '/a'],
    ['https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)'],
    ['./my file.md', '<./my file.md>'],
    ['/a)b', '</a)b>'],
    ['/a(b', '</a(b>'],
    ['/a<b>', '</a%3Cb%3E>'],
    ['', '<>'],
  ])('%j → %j', (url, written) => {
    expect(linkDestination(url)).toBe(written);
  });
});

describe('linkText', () => {
  it.each([
    ['המדריך', 'המדריך'],
    ['**חשוב**', '**חשוב**'],
    ['a [b] c', 'a [b] c'],
    ['a ] b', 'a \\] b'],
    ['a [ b', 'a \\[ b'],
    ['a \\] b', 'a \\] b'],
  ])('%j → %j', (text, written) => {
    expect(linkText(text)).toBe(written);
  });
});

describe('linkAt', () => {
  it.each([
    ['before the link', 1, null],
    ['at its start', 3, '[א](/a)'],
    ['in its URL', 7, '[א](/a)'],
    ['at its end', 10, '[א](/a)'],
    ['after it', 11, null],
  ])('%s', (_description, pos, expected) => {
    const state = stateOf('ab [א](/a) cd\n');
    const link = linkAt(state, pos);
    expect(link === null ? null : state.sliceDoc(link.from, link.to)).toBe(expected);
  });
});

describe('editLinkChanges', () => {
  const edited = (text: string, newText: string, url: string) => {
    const state = stateOf(text);
    return state
      .update({ changes: editLinkChanges(state, firstLink(state), newText, url) })
      .state.doc.toString();
  };

  it.each([
    ['the text', '[א](/a "t")\n', 'ב', '/a', '[ב](/a "t")\n'],
    ['the destination, keeping the title', '[א](/a "t")\n', 'א', '/b', '[א](/b "t")\n'],
    ['both', 'x [א](/a) y\n', 'ב', 'https://b', 'x [ב](https://b) y\n'],
    [
      'a destination that needs brackets',
      '[א](/a)\n',
      'א',
      './my file.md',
      '[א](<./my file.md>)\n',
    ],
    [
      'nothing (an unchanged bracketed destination)',
      '[א](<./a b>)\n',
      'א',
      './a b',
      '[א](<./a b>)\n',
    ],
    ['nothing (a destination with spaces around it)', '[א](/a)\n', 'א', ' /a ', '[א](/a)\n'],
  ])('changes %s', (_description, text, newText, url, expected) => {
    expect(edited(text, newText, url)).toBe(expected);
  });
});

describe('unlinkChanges and newLink', () => {
  it('drops a link and keeps its text', () => {
    const state = stateOf('ראו [**המדריך**](/a "t") כאן\n');
    expect(state.update({ changes: unlinkChanges(firstLink(state)) }).state.doc.toString()).toBe(
      'ראו **המדריך** כאן\n',
    );
  });

  it.each([
    ['המדריך', '/a', '[המדריך](/a)'],
    ['', 'https://example.org', '[https://example.org](https://example.org)'],
    ['a ] b', './x y', '[a \\] b](<./x y>)'],
  ])('writes [%s](%s) as %s', (text, url, expected) => {
    expect(newLink(text, url)).toBe(expected);
  });
});

describe('linkEditing', () => {
  let views: EditorView[] = [];
  // Focus can't be driven in happy-dom (it fires `selectionchange` synchronously, inside
  // CodeMirror's update); the E2E covers real focus. Here, returning to the editor is recorded.
  let focused: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    focused = vi.spyOn(EditorView.prototype, 'focus').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
    vi.restoreAllMocks();
  });

  /** An editor over `text` (with link previews, as in the app), and the requests it makes. */
  function editorOver(text: string, readOnly = false) {
    const requests: LinkEdit[] = [];
    const view = new EditorView({
      state: EditorState.create({
        doc: text,
        extensions: [
          markdownLanguage(false),
          EditorState.readOnly.of(readOnly),
          livePreview,
          linkEditing((edit) => {
            requests.push(edit);
          }),
        ],
      }),
      parent: document.body,
    });
    ensureSyntaxTree(view.state, text.length, 5000);
    views.push(view);
    return { view, requests };
  }

  /** Presses Ctrl+K with the selection at `anchor`…`head`. */
  function pressCtrlK(text: string, anchor: number, head = anchor, readOnly = false) {
    const editor = editorOver(text, readOnly);
    editor.view.dispatch({ selection: { anchor, head } });
    const pressed = runScopeHandlers(
      editor.view,
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      'editor',
    );
    return { ...editor, pressed };
  }

  it('edits the link at the caret: only what changed', () => {
    const { view, requests, pressed } = pressCtrlK('ראו [המדריך](/a "t") כאן\n', 6);
    expect(pressed).toBe(true);
    const [edit] = requests;
    expect(edit).toMatchObject({ text: 'המדריך', url: '/a', existing: true });
    expect(focused).not.toHaveBeenCalled();
    edit?.apply('המדריך החדש', '/b');
    expect(view.state.doc.toString()).toBe('ראו [המדריך החדש](/b "t") כאן\n');
    expect(focused).toHaveBeenCalledTimes(1);
  });

  it('removes the link at the caret, keeping its text', () => {
    const { view, requests } = pressCtrlK('ראו [המדריך](/a) כאן\n', 6);
    requests[0]?.remove();
    expect(view.state.doc.toString()).toBe('ראו המדריך כאן\n');
  });

  it('makes a link from the selected text, with the caret after it', () => {
    const { view, requests } = pressCtrlK('ראו המדריך כאן\n', 4, 10);
    expect(requests[0]).toMatchObject({ text: 'המדריך', url: '', existing: false });
    requests[0]?.apply('המדריך', './guide.md');
    expect(view.state.doc.toString()).toBe('ראו [המדריך](./guide.md) כאן\n');
    expect(view.state.selection.main.head).toBe('ראו [המדריך](./guide.md)'.length);
  });

  it('makes a link at the caret', () => {
    const { view, requests } = pressCtrlK('ראו \n', 4);
    requests[0]?.apply('', 'https://example.org');
    expect(view.state.doc.toString()).toBe('ראו [https://example.org](https://example.org)\n');
  });

  it('changes nothing on cancel, or when the text changed meanwhile', () => {
    const { view, requests } = pressCtrlK('[א](/a)\n', 1);
    requests[0]?.cancel();
    expect(view.state.doc.toString()).toBe('[א](/a)\n');
    expect(focused).toHaveBeenCalledTimes(1);
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    requests[0]?.apply('ב', '/b');
    expect(view.state.doc.toString()).toBe('x[א](/a)\n');
  });

  it('ignores Ctrl+K in read-only text, and on a selection across lines', () => {
    expect(pressCtrlK('[א](/a)\n', 1, 1, true)).toMatchObject({ pressed: false, requests: [] });
    expect(pressCtrlK('a\nb\n', 0, 3)).toMatchObject({ pressed: false, requests: [] });
  });

  const clickChip = (view: EditorView) => {
    const chip = view.contentDOM.querySelector('.cm-md-link-chip');
    if (chip === null) throw new Error('test setup: no chip');
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  };

  it('edits a link when its chip is clicked, in editable text only', () => {
    const editable = editorOver('ראו [המדריך](/a) כאן\n');
    clickChip(editable.view);
    expect(editable.requests).toMatchObject([{ text: 'המדריך', url: '/a', existing: true }]);
    const readOnly = editorOver('ראו [המדריך](/a) כאן\n', true);
    clickChip(readOnly.view);
    expect(readOnly.requests).toEqual([]);
  });
});
