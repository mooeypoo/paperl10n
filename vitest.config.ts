// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The floor applies to pure code only (docs/plan/M0.md §6.3). UI and Electron glue are
      // covered by behavior tests and e2e instead.
      include: [
        'src/shared/**/*.ts',
        'src/app/*.ts',
        'src/domains/*/domain/**/*.ts',
        'src/domains/*/application/**/*.ts',
        'src/plugins/*/**/*.ts',
        'scripts/spdx.ts',
      ],
      exclude: ['**/*.test.ts', 'src/plugins/*/fixtures/**'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
