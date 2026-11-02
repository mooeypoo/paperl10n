// SPDX-License-Identifier: GPL-3.0-or-later
import type { PlaceholderTokenDto } from '#ipc-contract';
import { undo } from '@codemirror/commands';
import { runScopeHandlers } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMessageEditor,
  type MessageEditor,
  type MessageEditorCommands,
  type MessageEditorOptions,
} from './message-editor';
import { markedTokens } from './message-tokens';

const token = (kind: PlaceholderTokenDto['kind'], start: number, end: number) => ({
  kind,
  start,
  end,
});
// "There are {{PLURAL:$1|one|$1}} here", in Hebrew: a plural with parameters inside it.
const TEXT = 'יש {{PLURAL:$1|אחד|$1}} כאן';
const TOKENS = [token('plural', 3, 23), token('parameter', 12, 14), token('parameter', 19, 21)];

let editors: MessageEditor[] = [];
afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
});

function editorWith(options: Partial<MessageEditorOptions> = {}) {
  const ran: string[] = [];
  const changes: string[] = [];
  const commands = Object.fromEntries(
    ['next', 'previous', 'nextNeedingWork', 'previousNeedingWork', 'close'].map((name) => [
      name,
      () => {
        ran.push(name);
      },
    ]),
  ) as unknown as MessageEditorCommands;
  const parent = document.createElement('div');
  document.body.append(parent);
  const editor = createMessageEditor(parent, {
    text: TEXT,
    tokens: TOKENS,
    lang: 'he',
    dir: 'rtl',
    label: 'Translation of greeting',
    placeholder: 'Write the translation',
    onChange: (text) => {
      changes.push(text);
    },
    commands,
    ...options,
  });
  editors.push(editor);
  return { editor, parent, ran, changes };
}

const press = (editor: MessageEditor, key: string, modifiers: KeyboardEventInit = {}) =>
  runScopeHandlers(
    editor.view,
    new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }),
    'editor',
  );

describe('the message editor', () => {
  it('shows the text in the target’s language and direction, with its accessible name', () => {
    const { editor, parent } = editorWith();
    expect(editor.text()).toBe(TEXT);
    const content = parent.shadowRoot?.querySelector('.cm-content');
    expect(content?.getAttribute('lang')).toBe('he');
    expect(content?.getAttribute('dir')).toBe('rtl');
    expect(content?.getAttribute('aria-label')).toBe('Translation of greeting');
  });

  it('marks every token by kind, and isolates only the top-level ones', () => {
    const { editor } = editorWith();
    expect(markedTokens(editor.view.state)).toEqual([
      { from: 3, to: 23, kind: 'plural', isolated: true },
      { from: 12, to: 14, kind: 'parameter', isolated: false },
      { from: 19, to: 21, kind: 'parameter', isolated: false },
    ]);
    expect(editor.view.dom.querySelector('.cm-msg-isolate')?.getAttribute('dir')).toBe('ltr');
  });

  it('moves the marks along with edits until main answers again', () => {
    const { editor, changes } = editorWith();
    editor.view.dispatch({ changes: { from: 0, insert: 'כן, ' } });
    expect(changes).toEqual([`כן, ${TEXT}`]);
    expect(markedTokens(editor.view.state).map(({ from, to }) => [from, to])).toEqual([
      [7, 27],
      [16, 18],
      [23, 25],
    ]);
  });

  it('reports edits, not moves of the caret', () => {
    const { editor, changes } = editorWith();
    editor.view.dispatch({ selection: { anchor: 2 } });
    editor.view.dispatch({ effects: [] });
    expect(changes).toEqual([]);
  });

  it('takes main’s tokens only for the text it has now', () => {
    const { editor } = editorWith({ text: 'שלום', tokens: [] });
    expect(editor.setTokens([token('parameter', 5, 7)], 'שלום $1')).toBe(false);
    expect(markedTokens(editor.view.state)).toEqual([]);
    editor.view.dispatch({ changes: { from: 4, insert: ' $1' } });
    expect(editor.setTokens([token('parameter', 5, 7)], 'שלום $1')).toBe(true);
    expect(markedTokens(editor.view.state)).toEqual([
      { from: 5, to: 7, kind: 'parameter', isolated: true },
    ]);
  });

  it('ignores tokens outside the text', () => {
    const { editor } = editorWith({ text: 'ab', tokens: [token('parameter', 1, 5)] });
    expect(markedTokens(editor.view.state)).toEqual([]);
  });

  it.each([
    ['ArrowDown', { altKey: true }, 'next'],
    ['ArrowUp', { altKey: true }, 'previous'],
    ['ArrowDown', { altKey: true, shiftKey: true }, 'nextNeedingWork'],
    ['ArrowUp', { altKey: true, shiftKey: true }, 'previousNeedingWork'],
    ['Escape', {}, 'close'],
  ])('runs %s %o as %s, instead of moving lines', (key, modifiers, command) => {
    const { editor, ran } = editorWith({ text: 'א\nב' });
    expect(press(editor, key, modifiers)).toBe(true);
    expect(ran).toEqual([command]);
    expect(editor.text()).toBe('א\nב');
  });

  it('undoes edits', () => {
    const { editor } = editorWith({ text: 'א' });
    editor.view.dispatch({ changes: { from: 1, insert: 'ב' } });
    undo(editor.view);
    expect(editor.text()).toBe('א');
  });

  it('shows what to write while empty', () => {
    const { parent } = editorWith({ text: '', tokens: [] });
    expect(parent.shadowRoot?.querySelector('.cm-placeholder')?.textContent).toBe(
      'Write the translation',
    );
  });
});
