// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every ProjectWriter implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { FileTree } from '#domain-testing/formats';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import type { ProjectWriter } from '../application/ports/project-writer.ts';

export interface WriterUnderTest {
  readonly writer: ProjectWriter;
  /** Reads the project back (from disk, for a real writer): every file's text, by path. */
  readonly contents: () => Promise<Readonly<Record<string, string>>>;
}

function p(raw: string): ProjectPath {
  const path = projectPath(raw);
  if (!path.ok) throw new Error(`test setup: invalid path ${raw}`);
  return path.value;
}

/** `make(tree)` sets up a project holding `tree`, and a writer for it. */
export function describeProjectWriterContract(
  name: string,
  make: (tree: FileTree) => Promise<WriterUnderTest>,
): void {
  describe(`ProjectWriter contract: ${name}`, () => {
    const tree = { 'paperl10n.config.json': '{}\n', 'en/index.md': '# Hello\n' };

    it('replaces a file, and later reads see the new text', async () => {
      const { writer, contents } = await make(tree);
      expect(await writer.writeText(p('paperl10n.config.json'), '{ "a": 1 }\n')).toEqual({
        ok: true,
        value: undefined,
      });
      expect(await contents()).toEqual({ ...tree, 'paperl10n.config.json': '{ "a": 1 }\n' });
    });

    it('writes the text exactly: a BOM, CRLF, and non-Latin text survive', async () => {
      const { writer, contents } = await make(tree);
      const text = '\uFEFF{\r\n  "name": "עברית ✓"\r\n}';
      await writer.writeText(p('en/index.md'), text);
      expect((await contents())['en/index.md']).toBe(text);
    });

    it('creates a file in an existing folder, and leaves no other files behind', async () => {
      const { writer, contents } = await make(tree);
      expect((await writer.writeText(p('en/new.md'), 'new')).ok).toBe(true);
      expect(await contents()).toEqual({ ...tree, 'en/new.md': 'new' });
    });

    it('creates missing folders when asked, and only then', async () => {
      const { writer, contents } = await make(tree);
      expect((await writer.writeText(p('ar/guide/intro.md'), 'x')).ok).toBe(false);
      expect(
        await writer.writeText(p('ar/guide/intro.md'), 'مرحبا', { createFolders: true }),
      ).toEqual({
        ok: true,
        value: undefined,
      });
      expect((await writer.writeText(p('ar/guide/more.md'), 'y')).ok).toBe(true);
      expect(await contents()).toEqual({
        ...tree,
        'ar/guide/intro.md': 'مرحبا',
        'ar/guide/more.md': 'y',
      });
    });

    it('refuses to create a folder where a file stands, changing nothing', async () => {
      const { writer, contents } = await make(tree);
      expect(
        await writer.writeText(p('en/index.md/inner.md'), 'x', { createFolders: true }),
      ).toEqual({
        ok: false,
        error: { code: 'files.not-a-directory', path: 'en/index.md/inner.md' },
      });
      expect(await contents()).toEqual(tree);
    });

    it.each<[string, string, string]>([
      ['a folder', 'en', 'files.not-a-file'],
      ['the project root', '', 'files.not-a-file'],
      ['a file in a missing folder', 'fr/index.md', 'files.not-found'],
    ])('refuses to write over %s, changing nothing', async (_description, raw, code) => {
      const { writer, contents } = await make(tree);
      expect(await writer.writeText(p(raw), 'x')).toEqual({
        ok: false,
        error: { code, path: raw },
      });
      expect(await contents()).toEqual(tree);
    });
  });
}
