// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorView } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import MarkdownEditor from './MarkdownEditor.vue';

const hebrew = { id: 'he', direction: 'rtl' } as const;
let wrappers: { unmount(): void }[] = [];
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers = [];
});

function editorFor(props: Partial<InstanceType<typeof MarkdownEditor>['$props']> = {}) {
  const wrapper = mount(MarkdownEditor, {
    props: {
      file: '# כותרת\r\n\r\nטקסט\r\n',
      mdx: false,
      readOnly: false,
      locale: hebrew,
      label: 'x',
      ...props,
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  const root = (wrapper.element as HTMLElement).shadowRoot;
  const content = root?.querySelector<HTMLElement>('.cm-content');
  const view = content === null || content === undefined ? null : EditorView.findFromDOM(content);
  if (view === null) throw new Error('test setup: no editor');
  return { wrapper, view, root };
}

/** The component's exposed `text()` (lint can't see types through the .vue file). */
const textOf = (wrapper: ReturnType<typeof editorFor>['wrapper']) =>
  (wrapper.vm as unknown as { text(): string }).text();

describe('MarkdownEditor', () => {
  it("gives back the file's exact text, and its text after an edit, with its line endings", () => {
    const { wrapper, view } = editorFor();
    expect(textOf(wrapper)).toBe('# כותרת\r\n\r\nטקסט\r\n');
    view.dispatch({ changes: { from: view.state.doc.line(3).to, insert: ' נוסף' } });
    expect(textOf(wrapper)).toBe('# כותרת\r\n\r\nטקסט נוסף\r\n');
    expect(wrapper.emitted('edit')).toHaveLength(1);
  });

  it('lets the reader select but not change read-only text', () => {
    const { wrapper, view, root } = editorFor({ readOnly: true });
    expect(view.state.readOnly).toBe(true);
    expect(root?.querySelector('.cm-content')?.getAttribute('aria-readonly')).toBe('true');
    expect(wrapper.emitted('edit')).toBeUndefined();
  });

  it('starts over with a new file, dropping the previous edits and undo history', async () => {
    const { wrapper, view } = editorFor();
    view.dispatch({ changes: { from: 0, insert: 'X' } });
    await wrapper.setProps({ file: 'Other\n' });
    expect(textOf(wrapper)).toBe('Other\n');
    expect(view.state.doc.toString()).toBe('Other\n');
  });

  it('parses MDX files with MDX tolerance', () => {
    const { root } = editorFor({
      file: "import Card from './Card.astro';\n\nText\n",
      mdx: true,
    });
    expect(root?.querySelector('.cm-md-frontmatter')?.textContent).toBe(
      "import Card from './Card.astro';",
    );
  });
});
