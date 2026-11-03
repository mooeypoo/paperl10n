// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * The only pages the app opens, in the user's browser: the author's site, Paper Lion's
 * documentation and GitHub pages (its source and release notes), and the author's Buy Me a Coffee
 * page. Every other link stays refused (window.ts), including any other link an update notice
 * might carry. The same list as Plot Device's.
 */
const ALLOWED = [
  { origin: 'https://moriel.tech', path: '/' },
  { origin: 'https://mooeypoo.github.io', path: '/paperl10n/' },
  { origin: 'https://github.com', path: '/mooeypoo/paperl10n/' },
  { origin: 'https://buymeacoffee.com', path: '/mooeypoo/' },
];

export function isAllowedExternalLink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED.some(
    ({ origin, path }) => parsed.origin === origin && `${parsed.pathname}/`.startsWith(path),
  );
}
