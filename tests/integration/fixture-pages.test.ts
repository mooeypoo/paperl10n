// SPDX-License-Identifier: GPL-3.0-or-later
// Every Markdown page in every built-in plugin's fixtures, through the real parser: kept exactly
// (round-trip safety starts with the parse) and satisfying every block and span invariant. The
// fixtures are real project shapes (VitePress's containers, code groups, `<script setup>`,
// includes; Starlight's MDX), so a dialect gap shows up here before it does in a translation.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createLezerMarkdownParser } from '#adapters/document/lezer-markdown-parser';
import { parsedDocumentProblems } from '#domains/document';

const plugins = fileURLToPath(new URL('../../src/plugins', import.meta.url));

/** Every `.md` and `.mdx` file under `folder`, dot-folders included (`.vitepress/`). */
function pagesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return pagesIn(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

const pages = readdirSync(plugins, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const fixtures = join(plugins, entry.name, 'fixtures');
    try {
      return pagesIn(fixtures);
    } catch {
      return []; // a plugin without fixtures (none yet)
    }
  })
  .sort();

describe('fixture pages', () => {
  const parser = createLezerMarkdownParser();

  it('finds pages in the fixtures', () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it.each(pages.map((path) => [relative(plugins, path), path]))(
    'parses %s exactly, with every invariant',
    (_name, path) => {
      const text = readFileSync(path, 'utf8');
      const document = parser.parse(text, { mdx: path.endsWith('.mdx') });
      expect(document.text).toBe(text);
      expect(parsedDocumentProblems(document)).toEqual([]);
    },
  );
});
