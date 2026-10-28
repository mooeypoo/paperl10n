// SPDX-License-Identifier: GPL-3.0-or-later
// End-to-end tests of the built Electron app (`pnpm test:e2e`). Run through
// scripts/run-electron.ts, which removes ELECTRON_RUN_AS_NODE. See docs/adr/0011-testing-strategy.md.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One Electron app at a time: tests are few, and parallel windows only add flakiness.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 30_000,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  outputDir: 'test-results/e2e',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
