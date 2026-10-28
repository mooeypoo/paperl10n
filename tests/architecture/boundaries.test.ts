// SPDX-License-Identifier: GPL-3.0-or-later
// Guards the guards: each architecture rule has a sample that must fail, and positive controls
// that must pass, so a misconfigured or upgraded plugin can't silently stop enforcing anything.
// Samples are linted as virtual files at real paths; nothing is written to src/.
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../..', import.meta.url).pathname;

// Virtual files aren't part of a TypeScript project, so type-aware rules are off here.
// They have their own on-disk sample below.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: tseslint.configs.disableTypeChecked as Linter.Config,
});

async function ruleIdsFor(filePath: string, code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

const DEPENDENCIES = 'boundaries/dependencies';
const RELATIVE = 'paperl10n/no-relative-cross-unit-imports';
const UNKNOWN_FILE = 'boundaries/no-unknown-files';

describe('architecture rules report violations', () => {
  it.each<[string, string, string, string[]]>([
    [
      'domain layer imports Node',
      'src/domains/locale/domain/sample.ts',
      "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n",
      [DEPENDENCIES],
    ],
    [
      'domain layer imports an npm package',
      'src/domains/locale/domain/sample.ts',
      "import ts from 'typescript';\nexport const x = ts;\n",
      [DEPENDENCIES],
    ],
    [
      'domain layer imports another domain, even along a declared edge',
      'src/domains/workspace/domain/sample.ts',
      "import * as formats from '#domains/formats';\nexport const x = formats;\n",
      [DEPENDENCIES],
    ],
    [
      'application imports a domain without a declared edge',
      'src/domains/locale/application/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
      [DEPENDENCIES],
    ],
    [
      'application imports Node',
      'src/domains/workspace/application/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'index.ts imports Node',
      'src/domains/locale/index.ts',
      "export { readFile } from 'node:fs/promises';\n",
      [DEPENDENCIES],
    ],
    [
      'kernel imports a domain',
      'src/shared/kernel/sample.ts',
      "import * as locale from '#domains/locale';\nexport const x = locale;\n",
      [DEPENDENCIES],
    ],
    [
      'relative import into another domain (even its index.ts)',
      'src/domains/workspace/application/sample.ts',
      "import * as formats from '../../formats/index.ts';\nexport const x = formats;\n",
      [RELATIVE],
    ],
    [
      'relative import into the kernel',
      'src/domains/locale/domain/sample.ts',
      "import { ok } from '../../../shared/kernel/result.ts';\nexport const x = ok;\n",
      [RELATIVE],
    ],
    [
      'ui imports a domain',
      'src/ui/sample.ts',
      "import * as locale from '#domains/locale';\nexport const x = locale;\n",
      [DEPENDENCIES],
    ],
    [
      'main imports a domain instead of going through app/',
      'src/main/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
      [DEPENDENCIES],
    ],
    [
      'preload imports Node',
      'src/preload/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'a file outside every known area',
      'src/misc/sample.ts',
      'export const x = 1;\n',
      [UNKNOWN_FILE],
    ],
  ])('%s', async (_description, filePath, code, expected) => {
    expect(await ruleIdsFor(filePath, code)).toEqual(expected);
  });

  it('explains violations by pointing to AGENTS.md', async () => {
    const [result] = await eslint.lintText("import 'node:fs';\n", {
      filePath: `${repoRoot}src/domains/locale/domain/sample.ts`,
    });
    expect(result?.messages[0]?.message).toContain('AGENTS.md');
  });
});

describe('architecture rules allow the intended dependencies (positive controls)', () => {
  it.each<[string, string, string]>([
    [
      'application imports another domain along a declared edge',
      'src/domains/workspace/application/sample.ts',
      "import * as formats from '#domains/formats';\nexport const x = formats;\n",
    ],
    [
      'application imports the kernel',
      'src/domains/workspace/application/sample.ts',
      "import { ok } from '#kernel/result';\nexport const x = ok;\n",
    ],
    [
      'domain layer imports the kernel',
      'src/domains/locale/domain/sample.ts',
      "import { localeId } from '#kernel/locale-id';\nexport const x = localeId;\n",
    ],
    [
      'adapters import Node',
      'src/domains/formats/adapters/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
    ],
    [
      'tests import Vitest, Node, and domains',
      'src/domains/locale/domain/sample.test.ts',
      "import { it } from 'vitest';\nimport { tmpdir } from 'node:os';\nimport * as formats from '#domains/formats';\nexport const x = [it, tmpdir, formats];\n",
    ],
    [
      'app imports a domain through its index.ts',
      'src/app/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
    ],
    [
      'ui imports the kernel',
      'src/ui/sample.ts',
      "import { ok } from '#kernel/result';\nexport const x = ok;\n",
    ],
  ])('%s', async (_description, filePath, code) => {
    expect(await ruleIdsFor(filePath, code)).toEqual([]);
  });
});

describe('type-aware rules still run', () => {
  it('reports a floating promise (on-disk sample, linted with its TypeScript project)', async () => {
    const typed = new ESLint({ cwd: repoRoot, ignore: false });
    const [result] = await typed.lintFiles(['tests/architecture/samples/floating-promise.ts']);
    expect(result?.messages.map((message) => message.ruleId)).toContain(
      '@typescript-eslint/no-floating-promises',
    );
  });
});
