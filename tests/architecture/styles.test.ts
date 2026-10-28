// SPDX-License-Identifier: GPL-3.0-or-later
// The styling rules from AGENTS.md: samples that must fail, and controls that must pass.
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../..', import.meta.url).pathname;

async function rulesFor(file: string, code: string): Promise<string[]> {
  const result = await stylelint.lint({ code, codeFilename: `${repoRoot}${file}`, cwd: repoRoot });
  return (result.results[0]?.warnings ?? []).map((warning) => warning.rule);
}

const vue = (css: string) =>
  `<template><div class="x"></div></template>\n<style scoped>\n.x { ${css} }\n</style>\n`;

describe('styling rules', () => {
  it.each<[string, string, string]>([
    ['margin-left in a component', vue('margin-left: 1rem;'), 'property-disallowed-list'],
    ['padding-right in a stylesheet', '.x { padding-right: 1rem; }', 'property-disallowed-list'],
    ['left positioning', '.x { left: 0; }', 'property-disallowed-list'],
    ['text-align: right', vue('text-align: right;'), 'declaration-property-value-disallowed-list'],
    ['float: left', '.x { float: left; }', 'declaration-property-value-disallowed-list'],
    ['a hex color in a component', vue('color: #ff0000;'), 'color-no-hex'],
    ['an rgb() color', '.x { background: rgb(0 0 0); }', 'function-disallowed-list'],
    ['a named color', '.x { color: red; }', 'color-named'],
  ])('reports %s', async (_description, code, rule) => {
    const file = code.startsWith('<template>')
      ? 'src/ui/components/Sample.vue'
      : 'src/ui/styles/sample.css';
    expect(await rulesFor(file, code)).toContain(rule);
  });

  it.each<[string, string]>([
    [
      'logical properties and tokens',
      vue('margin-inline-start: var(--pl-space-2); text-align: start; color: var(--pl-color-ink);'),
    ],
    [
      'top and bottom (not direction-sensitive)',
      vue('margin-block-start: 1rem; inset-block-start: 0;'),
    ],
  ])('allows %s', async (_description, code) => {
    expect(await rulesFor('src/ui/components/Sample.vue', code)).toEqual([]);
  });

  it('allows raw colors only in the tokens file', async () => {
    expect(
      await rulesFor(
        'src/ui/styles/tokens.css',
        ':root { --pl-color-ink: #14213d; --x: rgb(0 0 0 / 30%); }',
      ),
    ).toEqual([]);
  });
});
