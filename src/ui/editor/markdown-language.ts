// SPDX-License-Identifier: GPL-3.0-or-later
// The editor's Markdown language: the app's own dialect from #markdown-syntax (ADR 0017), so the
// editor sees the blocks the reading model sees. Not @codemirror/lang-markdown, which nests the
// HTML, CSS, and JavaScript languages for highlighting (about 77 KB gzipped; M2 plan, E0).
import { defineLanguageFacet, Language, languageDataProp } from '@codemirror/language';
import { markdownSyntax } from '#markdown-syntax';

const data = defineLanguageFacet({ commentTokens: { block: { open: '<!--', close: '-->' } } });

function build(mdx: boolean): Language {
  const parser = markdownSyntax({ mdx, frontmatter: true }).configure({
    props: [languageDataProp.add({ Document: data })],
  });
  return new Language(data, parser, [], mdx ? 'mdx' : 'markdown');
}

const languages = { markdown: build(false), mdx: build(true) };

/** The language for a Markdown or an MDX file. */
export function markdownLanguage(mdx: boolean): Language {
  return mdx ? languages.mdx : languages.markdown;
}
