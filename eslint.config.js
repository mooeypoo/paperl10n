// SPDX-License-Identifier: GPL-3.0-or-later
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'node_modules/',
    'out/',
    'dist/',
    'coverage/',
    // Fixtures stand in for users' projects; they are data, not our code.
    'tests/fixtures/',
    'src/plugins/*/fixtures/',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: 'error',
      // Error codes are string-literal unions (ADR 0007); every switch over them must be exhaustive.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  // Plain JavaScript (config files) isn't part of a TypeScript project.
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], extends: [tseslint.configs.disableTypeChecked] },

  // Last: turn off every rule that Prettier owns.
  prettier,
);
