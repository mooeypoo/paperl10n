// SPDX-License-Identifier: GPL-3.0-or-later
import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './csp.ts';

/** Injects the Content-Security-Policy meta tag: the dev policy when serving, the strict one in builds. */
export function cspPlugin(): Plugin {
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
