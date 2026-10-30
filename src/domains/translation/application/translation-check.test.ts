// SPDX-License-Identifier: GPL-3.0-or-later
import type { Block, InlineSpan, ParsedDocument, PreservedElement } from '#domains/document';
import { describe, expect, it } from 'vitest';
import { checkTranslation, renderedLength } from './translation-check.ts';

/** A range in `text`: where `part` first occurs (from `after`, if given). */
function at(text: string, part: string, after = 0): { start: number; end: number } {
  const start = text.indexOf(part, after);
  if (start === -1) throw new Error(`test setup: no "${part}"`);
  return { start, end: start + part.length };
}

/**
 * A parsed document: each line that isn't blank is a block (a heading with `#`s, a code block
 * when it starts with ```, a paragraph otherwise), and `link:x`, `image:x`, and `<Name` in a line
 * are preserved elements (their markup spans and URLs marked, too).
 */
function parsed(text: string): ParsedDocument {
  const blocks: Block[] = [];
  const inline: InlineSpan[] = [];
  const preserved: PreservedElement[] = [];
  let start = 0;
  for (const line of text.split('\n')) {
    const range = { start, end: start + line.length };
    const depth = /^(#{1,6}) /.exec(line)?.[1]?.length;
    if (line.trim() !== '') {
      if (depth !== undefined) {
        blocks.push({ kind: 'heading', range, depth });
        inline.push({ kind: 'markup', range: { start, end: start + depth } });
      } else if (line.startsWith('```')) {
        blocks.push({ kind: 'code', range });
        preserved.push({ kind: 'code-block', range, value: line.slice(3).split(' ')[0] ?? '' });
      } else {
        blocks.push({ kind: 'paragraph', range });
      }
      for (const match of line.matchAll(/(link|image):(\S+)|<(\w+)/g)) {
        const from = start + match.index;
        const to = from + match[0].length;
        if (match[3] !== undefined) {
          preserved.push({ kind: 'component', range: { start: from, end: to }, value: match[3] });
          inline.push({ kind: 'markup', range: { start: from, end: to } });
        } else {
          const kind = match[1] === 'image' ? 'image' : 'link';
          preserved.push({ kind, range: { start: from, end: to }, value: match[2] ?? '' });
          inline.push({ kind: 'url', range: { start: from, end: to } });
        }
      }
    }
    start += line.length + 1;
  }
  return { text, blocks, inline, preserved };
}

const asWritten = (target: string) => target;

describe('checkTranslation', () => {
  const source = parsed('Intro link:/a/\n\n## One\n\nSee link:/b/ and <Badge\n\n## Two\n\n```ts\n');

  it('finds nothing when the translation keeps everything', () => {
    const translation = parsed(
      'מבוא link:/a/\n\n## אחד\n\nראו <Badge link:/b/\n\n## שתיים\n\n```ts\n',
    );
    const check = checkTranslation(source, translation, asWritten);
    expect(check.page).toEqual([]);
    expect(check.sections).toEqual([[], [], []]);
  });

  it('gives each section pair its own hints, and the page all of them', () => {
    const translation = parsed('מבוא link:/a/\n\n## אחד\n\nראו link:/z/\n\n## שתיים\n\n```js\n');
    const check = checkTranslation(source, translation, asWritten);
    expect(check.sections).toEqual([
      [],
      [
        { kind: 'link', missing: ['/b/'], extra: ['/z/'] },
        { kind: 'component', missing: ['Badge'], extra: [] },
      ],
      [{ kind: 'code-block', missing: ['ts'], extra: ['js'] }],
    ]);
    expect(check.page).toEqual([
      { kind: 'code-block', missing: ['ts'], extra: ['js'] },
      { kind: 'link', missing: ['/b/'], extra: ['/z/'] },
      { kind: 'component', missing: ['Badge'], extra: [] },
    ]);
  });

  it('notices a link moved to another section, though the page has the same links', () => {
    const translation = parsed(
      'מבוא\n\n## אחד\n\nראו <Badge link:/b/ link:/a/\n\n## שתיים\n\n```ts\n',
    );
    const check = checkTranslation(source, translation, asWritten);
    expect(check.page).toEqual([]);
    expect(check.sections?.slice(0, 2)).toEqual([
      [{ kind: 'link', missing: ['/a/'], extra: [] }],
      [{ kind: 'link', missing: [], extra: ['/a/'] }],
    ]);
  });

  it('keeps an element that starts a section in that section, not the one before', () => {
    // A frontmatter block (its three lines), then an intro that opens with a link.
    const withFrontmatter = (text: string): ParsedDocument => {
      const document = parsed(text);
      const [, , fence, ...rest] = document.blocks;
      if (fence === undefined) throw new Error('test setup');
      return {
        ...document,
        blocks: [{ kind: 'frontmatter', range: { start: 0, end: fence.range.end } }, ...rest],
      };
    };
    const source = withFrontmatter('---\nx\n---\nlink:/a/ intro\n## One\n');
    const translation = withFrontmatter('---\nx\n---\nמבוא link:/a/\n## אחד\n');
    expect(checkTranslation(source, translation, asWritten).sections).toEqual([[], [], []]);
  });

  it('reads the translation’s links in the source’s form, and only its links', () => {
    const translation = parsed(
      'מבוא link:/he/a/ image:/he/x.png\n\n## אחד\n\n<Badge link:/he/b/\n\n## שתיים\n\n```ts\n',
    );
    const asked: string[] = [];
    const fromHebrew = (target: string) => {
      asked.push(target);
      return target.replace(/^\/he\//, '/');
    };
    const check = checkTranslation(source, translation, fromHebrew);
    expect(check.page).toEqual([{ kind: 'image', missing: [], extra: ['/he/x.png'] }]);
    // Only the translation's links are mapped: the source's are its own form already.
    expect(new Set(asked)).toEqual(new Set(['/he/a/', '/he/b/']));
    // Without the mapping, every localized link would be flagged.
    expect(checkTranslation(source, translation, asWritten).page[0]).toEqual({
      kind: 'link',
      missing: ['/a/', '/b/'],
      extra: ['/he/a/', '/he/b/'],
    });
  });

  it('gives no section hints when the sections don’t pair, and none for a one-sided pair', () => {
    const unpaired = checkTranslation(source, parsed('רק טקסט link:/a/\n'), asWritten);
    expect(unpaired.sections).toBeNull();
    expect(unpaired.page.map((hint) => hint.kind)).toEqual(['code-block', 'link', 'component']);

    // The translation has an intro the source lacks: that pair has no hints.
    const noIntro = parsed('## One\n\nlink:/b/\n');
    const withIntro = parsed('מבוא link:/q/\n\n## אחד\n\nlink:/b/\n');
    expect(checkTranslation(noIntro, withIntro, asWritten).sections).toEqual([[], []]);
  });
});

describe('renderedLength', () => {
  it.each([
    ['prose, without whitespace', 'Hello there\n', 10],
    ['without heading marks', '## Hi\n', 2],
    ['without link destinations', 'See link:/somewhere/ now\n', 6],
    ['without components', 'A <Badge B\n', 2],
    ['without code blocks', 'One\n\n```ts\n', 3],
    ['characters, not UTF-16 units', '𝒳𝒴\n', 2],
    ['Hebrew', 'שלום עולם\n', 8],
  ])('counts %s', (_description, text, expected) => {
    expect(renderedLength(parsed(text))).toBe(expected);
  });

  it('skips the frontmatter, HTML, MDX lines, link definitions, and container fences', () => {
    const text = 'a\nb\nc\nd\ne\nf\nkept\n';
    const kinds: Block['kind'][] = [
      'frontmatter',
      'html',
      'mdx-esm',
      'link-definition',
      'container-fence',
      'code',
    ];
    const document: ParsedDocument = {
      ...parsed(text),
      blocks: [
        ...kinds
          .map((kind, index) => ({ kind, range: at(text, `${'abcdef'[index] ?? ''}\n`) }))
          .map((block) => ({
            ...block,
            range: { start: block.range.start, end: block.range.end - 1 },
          })),
        { kind: 'paragraph', range: at(text, 'kept') },
      ],
    };
    expect(renderedLength(document)).toBe(4);
    expect(checkTranslation(document, parsed('xy\n'), asWritten).length).toEqual({
      source: 4,
      translation: 2,
    });
  });
});
