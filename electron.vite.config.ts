// SPDX-License-Identifier: GPL-3.0-or-later
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';
import { cspPlugin } from './scripts/vite-csp-plugin.ts';

export default defineConfig({
  main: {
    build: {
      rolldownOptions: { input: { index: resolve(import.meta.dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    // A sandboxed preload must be a single CommonJS file.
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/ui'),
    plugins: [vue(), cspPlugin()],
    build: {
      rolldownOptions: { input: { index: resolve(import.meta.dirname, 'src/ui/index.html') } },
    },
  },
});
