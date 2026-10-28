// SPDX-License-Identifier: GPL-3.0-or-later
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { architectureConfig } from './scripts/eslint/architecture.ts';

export default defineConfig(
  globalIgnores([
    'node_modules/',
    'out/',
    'dist/',
    'coverage/',
    // Fixtures stand in for users' projects; they are data, not our code.
    'tests/fixtures/',
    'src/plugins/*/fixtures/',
    // Deliberately broken samples, linted only by tests/architecture/.
    'tests/architecture/samples/',
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

  // Vue single-file components. Type-aware rules don't run reliably on .vue files through the
  // project service, so .vue files get the non-type-aware rules; vue-tsc checks their types.
  // Logic belongs in .ts composables, where every rule applies.
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        projectService: false,
      },
    },
    // TypeScript checks names (vue-tsc); core no-undef doesn't know DOM or TS types.
    rules: { 'no-undef': 'off' },
  },

  // AGENTS.md architecture rules (boundaries, entry points, relative imports).
  ...architectureConfig,

  // Plain JavaScript (config files) isn't part of a TypeScript project.
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], extends: [tseslint.configs.disableTypeChecked] },

  // Last: turn off every rule that Prettier owns.
  prettier,
);
