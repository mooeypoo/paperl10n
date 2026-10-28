// SPDX-License-Identifier: GPL-3.0-or-later
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './scripts/csp.ts';

function cspPlugin(): Plugin {
  let mode: 'development' | 'production' = 'production';
  return {
    name: 'paperl10n-csp',
    configResolved(config) {
      mode = config.command === 'serve' ? 'development' : 'production';
    },
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(mode) },
        injectTo: 'head-prepend',
      },
    ],
  };
}

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
    plugins: [cspPlugin()],
    build: {
      rolldownOptions: { input: { index: resolve(import.meta.dirname, 'src/ui/index.html') } },
    },
  },
});
