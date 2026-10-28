// SPDX-License-Identifier: GPL-3.0-or-later
// The browser UI harness (`pnpm dev:harness`): a testing aid, never built or shipped (ADR 0015).
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { cspPlugin } from './scripts/vite-csp-plugin.ts';

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/ui-harness'),
  plugins: [vue(), cspPlugin()],
  server: { host: 'localhost', port: 5174, strictPort: true },
});
