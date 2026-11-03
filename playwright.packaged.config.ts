// SPDX-License-Identifier: GPL-3.0-or-later
// End-to-end tests against the packaged app, as installed (M6). Run `pnpm package:dir` first (or
// `pnpm package`), or point PAPERL10N_PACKAGED at an installed executable; then
// `pnpm test:e2e:packaged`. As Plot Device's playwright.packaged.config.ts.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e-packaged',
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['github']],
  outputDir: 'test-results/e2e-packaged',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
