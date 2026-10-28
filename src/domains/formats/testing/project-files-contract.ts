// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every ProjectFiles implementation must have, stated once. Run against the
// in-memory fake and the real Node adapter, so the fake can't drift from reality.
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT, projectPath, type ProjectPath } from '#kernel/project-path';
import type { ProjectFiles } from '../application/ports/project-files.ts';
import type { FileTree } from '../adapters/in-memory-project-files.ts';

function p(raw: string): ProjectPath {
  const path = projectPath(raw);
  if (!path.ok) throw new Error(`test setup: invalid path ${raw}`);
  return path.value;
}

const tree: FileTree = {
  'README.md': '# Readme\n',
  'docs/index.md': '\uFEFF# Home\r\n',
  'docs/guide/intro.md': 'Intro\n',
  'docs/guide/notes.txt': 'not markdown\n',
  'docs/he/index.md': '# בית\n',
  '.vitepress/config.ts': 'export default {};\n',
  '.git/HEAD': 'ref: refs/heads/main\n',
  'node_modules/pkg/README.md': 'dependency\n',
  'docs/node_modules/nested/x.md': 'nested dependency\n',
  'latin1.md': new Uint8Array([0x63, 0x61, 0x66, 0xe9]), // "café" in Latin-1: not UTF-8
};

/** `make` builds an implementation over `tree`, rooted at the project folder. */
export function describeProjectFilesContract(
  name: string,
  make: (tree: FileTree) => Promise<ProjectFiles>,
): void {
  describe(`ProjectFiles contract: ${name}`, () => {
    describe('list', () => {
      it('lists every file recursively, sorted, relative to the project root', async () => {
        const files = await make(tree);
        expect(await files.list(PROJECT_ROOT)).toEqual({
          ok: true,
          value: [
            '.vitepress/config.ts',
            'README.md',
            'docs/guide/intro.md',
            'docs/guide/notes.txt',
            'docs/he/index.md',
            'docs/index.md',
            'latin1.md',
          ],
        });
      });

      it('lists a subfolder with paths still relative to the project root', async () => {
        const files = await make(tree);
        expect(await files.list(p('docs/guide'))).toEqual({
          ok: true,
          value: ['docs/guide/intro.md', 'docs/guide/notes.txt'],
        });
      });

      it('filters by exact extension', async () => {
        const files = await make(tree);
        expect(await files.list(p('docs'), { extensions: ['.md'] })).toEqual({
          ok: true,
          value: ['docs/guide/intro.md', 'docs/he/index.md', 'docs/index.md'],
        });
        expect(await files.list(p('docs'), { extensions: ['.MD'] })).toEqual({
          ok: true,
          value: [],
        });
      });

      it('skips .git and node_modules at any depth, but keeps other dot-folders', async () => {
        const files = await make(tree);
        const listed = await files.list(PROJECT_ROOT);
        expect(listed.ok && listed.value.some((path) => path.includes('node_modules'))).toBe(false);
        expect(listed.ok && listed.value.some((path) => path.startsWith('.git/'))).toBe(false);
        expect(listed.ok && listed.value.includes(p('.vitepress/config.ts'))).toBe(true);
      });

      it('reports a missing folder', async () => {
        const files = await make(tree);
        expect(await files.list(p('nope'))).toEqual({
          ok: false,
          error: { code: 'files.not-found', path: 'nope' },
        });
      });

      it('reports a file given as a folder', async () => {
        const files = await make(tree);
        expect(await files.list(p('README.md'))).toEqual({
          ok: false,
          error: { code: 'files.not-a-directory', path: 'README.md' },
        });
      });
    });

    describe('readText', () => {
      it('returns content exactly, keeping a BOM and CRLF line endings', async () => {
        const files = await make(tree);
        expect(await files.readText(p('docs/index.md'))).toEqual({
          ok: true,
          value: '\uFEFF# Home\r\n',
        });
      });

      it('reads non-Latin text', async () => {
        const files = await make(tree);
        expect(await files.readText(p('docs/he/index.md'))).toEqual({ ok: true, value: '# בית\n' });
      });

      it('reports a missing file', async () => {
        const files = await make(tree);
        expect(await files.readText(p('docs/missing.md'))).toEqual({
          ok: false,
          error: { code: 'files.not-found', path: 'docs/missing.md' },
        });
      });

      it('reports a folder given as a file', async () => {
        const files = await make(tree);
        expect(await files.readText(p('docs'))).toEqual({
          ok: false,
          error: { code: 'files.not-a-file', path: 'docs' },
        });
      });

      it('reports content that is not UTF-8', async () => {
        const files = await make(tree);
        expect(await files.readText(p('latin1.md'))).toEqual({
          ok: false,
          error: { code: 'files.not-utf8', path: 'latin1.md' },
        });
      });
    });

    describe('exists', () => {
      it.each([
        ['a file', 'README.md', true],
        ['a folder', 'docs/guide', true],
        ['the project root', '', true],
        ['a dot-folder', '.vitepress', true],
        ['a missing path', 'docs/missing.md', false],
      ])('%s → %s', async (_description, raw, expected) => {
        const files = await make(tree);
        expect(await files.exists(p(raw))).toBe(expected);
      });
    });
  });
}
