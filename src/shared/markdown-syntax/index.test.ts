// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { findFrontmatter } from '#domains/document';
import { markdownSyntax } from './index.ts';

const topLevel = (text: string, options = { mdx: false, frontmatter: true }) => {
  const nodes: { name: string; text: string }[] = [];
  const tree = markdownSyntax(options).parse(text);
  for (let node = tree.topNode.firstChild; node !== null; node = node.nextSibling) {
    nodes.push({ name: node.name, text: text.slice(node.from, node.to) });
  }
  return nodes;
};

const frontmatterRange = (text: string) => {
  const node = markdownSyntax({ mdx: false, frontmatter: true }).parse(text).topNode.firstChild;
  return node?.name === 'Frontmatter' ? { start: node.from, end: node.to } : null;
};

describe('markdownSyntax', () => {
  it.each([
    ['YAML', '---\na: 1\n---\nBody\n'],
    ['TOML', '+++\na = 1\n+++\nBody'],
    ['after a BOM', '\uFEFF---\na: 1\n---\n'],
    ['with CRLF', '---\r\na: 1\r\n---\r\nBody'],
    ['empty', '---\n---\n'],
    ['at the very end', '---\na: 1\n---'],
    ['ignoring --- lines of the other kind', '+++\na: ---\n---\n+++\n'],
    ['no fence', '# Title\n---\n'],
    ['a fence with trailing text', '--- yaml\na: 1\n---\n'],
    ['a fence that is not first', '\n---\na: 1\n---\n'],
    ['a longer fence', '----\na: 1\n----\n'],
    ['an empty document', ''],
  ])('finds frontmatter where the document model does: %s', (_description, text) => {
    expect(frontmatterRange(text)).toEqual(findFrontmatter(text)?.range ?? null);
  });

  it('runs an unclosed frontmatter to the end of the text (the model finds none)', () => {
    const text = '---\na: 1\n\nBody\n';
    expect(findFrontmatter(text)).toBeNull();
    expect(frontmatterRange(text)).toEqual({ start: 0, end: text.length });
  });

  it('parses the body after frontmatter as Markdown', () => {
    expect(topLevel('---\ntitle: x\n---\n# Hello\n\n---\n')).toEqual([
      { name: 'Frontmatter', text: '---\ntitle: x\n---' },
      { name: 'ATXHeading1', text: '# Hello' },
      { name: 'HorizontalRule', text: '---' },
    ]);
  });

  it('leaves frontmatter to the caller unless asked', () => {
    expect(topLevel('---\ntitle: x\n---\n', { mdx: false, frontmatter: false })).toEqual([
      { name: 'HorizontalRule', text: '---' },
      { name: 'SetextHeading2', text: 'title: x\n---' },
    ]);
  });

  it('reads `:::` container fences as their own blocks', () => {
    expect(topLevel(':::note[Heads up]\nText\n:::\n')).toEqual([
      { name: 'ContainerFence', text: ':::note[Heads up]' },
      { name: 'Paragraph', text: 'Text' },
      { name: 'ContainerFence', text: ':::' },
    ]);
  });

  it('reads top-level import/export lines as blocks in MDX only', () => {
    const text = "import Card from './Card.astro';\n\nText\n";
    expect(topLevel(text, { mdx: true, frontmatter: false })[0]?.name).toBe('MdxEsm');
    expect(topLevel(text, { mdx: false, frontmatter: false })[0]?.name).toBe('Paragraph');
  });

  it('builds each configuration once', () => {
    const options = { mdx: true, frontmatter: true };
    expect(markdownSyntax(options)).toBe(markdownSyntax({ ...options }));
    expect(markdownSyntax(options)).not.toBe(markdownSyntax({ ...options, mdx: false }));
  });
});
