// SPDX-License-Identifier: GPL-3.0-or-later
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { noRelativeCrossUnitImports } from './no-relative-cross-unit-imports.ts';

RuleTester.describe = describe;
RuleTester.it = it;

// RuleTester lints with process.cwd() as the working directory; the rule reads paths relative to it.
const cwd = process.cwd();
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-relative-cross-unit-imports', noRelativeCrossUnitImports, {
  valid: [
    // Within a unit, relative imports are fine.
    { code: "import x from './y.ts';", filename: `${cwd}/src/domains/a/application/x.ts` },
    {
      code: "import x from '../domain/y.ts';",
      filename: `${cwd}/src/domains/a/application/x.ts`,
    },
    {
      code: "import x from './nested/y.ts';",
      filename: `${cwd}/src/plugins/format-stub/index.ts`,
    },
    // Aliases and packages aren't relative.
    { code: "import x from '#domains/b';", filename: `${cwd}/src/domains/a/application/x.ts` },
    { code: "import x from 'vue';", filename: `${cwd}/src/ui/x.ts` },
    // Outside src/ units (tests, scripts), relative imports aren't restricted.
    {
      code: "import x from '../../src/domains/a/index.ts';",
      filename: `${cwd}/tests/arch/x.ts`,
    },
  ],
  invalid: [
    {
      code: "import x from '../../b/index.ts';",
      filename: `${cwd}/src/domains/a/application/x.ts`,
      errors: [
        {
          messageId: 'leavesUnit',
          data: { source: '../../b/index.ts', fromUnit: 'domains/a', hint: '#domains/b' },
        },
      ],
    },
    {
      code: "export * from '../../../shared/kernel/result.ts';",
      filename: `${cwd}/src/domains/a/domain/x.ts`,
      errors: [{ messageId: 'leavesUnit' }],
    },
    {
      code: "export { ok } from '../../../shared/kernel/result.ts';",
      filename: `${cwd}/src/domains/a/domain/x.ts`,
      errors: [{ messageId: 'leavesUnit' }],
    },
    {
      code: "const m = await import('../../other-plugin/index.ts');",
      filename: `${cwd}/src/plugins/format-stub/nested/x.ts`,
      errors: [{ messageId: 'leavesUnit' }],
    },
    {
      code: "import x from '../../domains/a/index.ts';",
      filename: `${cwd}/src/plugins/format-stub/x.ts`,
      errors: [
        {
          messageId: 'leavesUnit',
          data: {
            source: '../../domains/a/index.ts',
            fromUnit: 'plugins/format-stub',
            hint: '#domains/a',
          },
        },
      ],
    },
  ],
});
