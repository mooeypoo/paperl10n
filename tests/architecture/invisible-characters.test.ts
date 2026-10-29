// SPDX-License-Identifier: GPL-3.0-or-later
// Invisible characters in source must be escapes: samples that must fail, controls that must pass.
// The samples build their characters with String.fromCodePoint, so this file has none itself.
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../..', import.meta.url).pathname;
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: tseslint.configs.disableTypeChecked as Linter.Config,
});

async function ruleIdsFor(code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, {
    filePath: `${repoRoot}src/shared/kernel/sample.ts`,
  });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

const BOM = String.fromCodePoint(0xfeff);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);

describe('invisible characters', () => {
  it.each([
    ['a BOM in a string', `export const x = '${BOM}---';\n`],
    ['a no-break space in a template', `export const x = \`a${NO_BREAK_SPACE}b\`;\n`],
    ['a zero-width space in a regular expression', `export const x = /a${ZERO_WIDTH_SPACE}b/;\n`],
    ['a BOM in a comment', `// before${BOM}after\nexport const x = 1;\n`],
  ])('reports %s', async (_description, code) => {
    expect(await ruleIdsFor(code)).toContain('no-irregular-whitespace');
  });

  it.each([
    ['the same characters as escapes', "export const x = ['\\uFEFF', '\\u00A0', /\\u200B/];\n"],
    ['Hebrew text with a right-to-left mark escape', "export const x = '\\u200Fשלום עולם';\n"],
  ])('allows %s', async (_description, code) => {
    expect(await ruleIdsFor(code)).toEqual([]);
  });
});
