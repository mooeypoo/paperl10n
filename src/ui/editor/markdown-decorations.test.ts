// SPDX-License-Identifier: GPL-3.0-or-later
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownLanguage } from './markdown-language.ts';
import { markdownStyles } from './markdown-decorations.ts';

const stylesOf = (text: string, mdx = false) => {
  const state = EditorState.create({ doc: text, extensions: [markdownLanguage(mdx)] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const styles = markdownStyles(state, 0, state.doc.length);
  const slice = (from: number, to: number) => state.doc.sliceString(from, to);
  return {
    lines: styles.lines.map((line) => ({
      line: state.doc.lineAt(line.from).text,
      classes: line.classes.join(' '),
      byLine: line.byLine,
    })),
    marks: styles.marks.map((mark) => [mark.kind, slice(mark.from, mark.to)]),
    isolates: styles.isolates.map((run) => slice(run.from, run.to)),
  };
};

describe('markdownStyles', () => {
  it('isolates inline code, URLs, and tags with letters in prose, never bare punctuation', () => {
    const { isolates, marks } = stylesOf(
      'הריצו `pnpm add` ואז [המדריך](https://example.org) או <Badge text="חדש" /> **כאן**.\n',
    );
    expect(isolates).toEqual(['`pnpm add`', 'https://example.org', '<Badge text="חדש" />']);
    expect(marks).toEqual([
      ['code', '`pnpm add`'],
      ['markup', '`'],
      ['markup', '`'],
      ['markup', '['],
      ['markup', ']'],
      ['markup', '('],
      ['url', 'https://example.org'],
      ['markup', ')'],
      ['markup', '<Badge text="חדש" />'],
      ['strong', '**כאן**'],
      ['markup', '**'],
      ['markup', '**'],
    ]);
  });

  it('styles emphasis, strong, and struck text with their marks', () => {
    expect(
      stylesOf('*נטוי* __מודגש__ ~~מחוק~~\n').marks.filter(([kind]) => kind !== 'markup'),
    ).toEqual([
      ['emphasis', '*נטוי*'],
      ['strong', '__מודגש__'],
      ['strikethrough', '~~מחוק~~'],
    ]);
  });

  it.each([
    ['a fenced code block', '```ts\nconst x = 1; // `y`\n```\n', 'cm-md-code', 3],
    ['an indented code block', '    code `x`\n', 'cm-md-code', 1],
    ['frontmatter', '---\ntitle: <b>x</b> `y`\n---\n', 'cm-md-frontmatter', 3],
    ['an HTML block', '<div class="note">\n<b>x</b>\n</div>\n', 'cm-md-html', 3],
    ['a container fence', ':::tip[טיפ]\n', 'cm-md-container-fence', 1],
  ])('reads %s line by line, isolating nothing inside', (_description, text, className, count) => {
    const { lines, isolates } = stylesOf(text);
    expect(lines).toEqual(
      Array.from({ length: count }, (_, index) => ({
        line: text.split('\n')[index],
        classes: className,
        byLine: true,
      })),
    );
    expect(isolates).toEqual([]);
  });

  it('reads MDX import/export lines line by line', () => {
    expect(stylesOf("import Card from './Card.astro';\n\nText\n", true).lines).toEqual([
      { line: "import Card from './Card.astro';", classes: 'cm-md-frontmatter', byLine: true },
    ]);
  });

  it('reads tables line by line but still isolates code inside cells', () => {
    const { lines, isolates } = stylesOf('| פקודה | |\n|---|---|\n| `npm i` | x |\n');
    expect(lines.map((line) => [line.classes, line.byLine])).toEqual([
      ['cm-md-table', true],
      ['cm-md-table', true],
      ['cm-md-table', true],
    ]);
    expect(isolates).toEqual(['`npm i`']);
  });

  it('styles headings on every line, in the pane direction', () => {
    expect(stylesOf('# כותרת\n\nTitle\n===\n').lines).toEqual([
      { line: '# כותרת', classes: 'cm-md-heading cm-md-h1', byLine: false },
      { line: 'Title', classes: 'cm-md-heading cm-md-h1', byLine: false },
      { line: '===', classes: 'cm-md-heading cm-md-h1', byLine: false },
    ]);
  });

  it('isolates a task marker only when it holds a letter', () => {
    expect(stylesOf('- [x] בוצע\n- [ ] לא\n').isolates).toEqual(['[x]']);
  });

  it('styles only the requested range', () => {
    const text = '```\na\n```\n\n# H\n';
    const state = EditorState.create({ doc: text, extensions: [markdownLanguage(false)] });
    ensureSyntaxTree(state, state.doc.length, 5000);
    const heading = state.doc.line(5);
    expect(markdownStyles(state, heading.from, heading.to).lines).toEqual([
      { from: heading.from, classes: ['cm-md-heading', 'cm-md-h1'], byLine: false },
    ]);
    expect(markdownStyles(state, 0, state.doc.line(2).to).lines).toHaveLength(2);
  });
});
