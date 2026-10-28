// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The renderer's Content Security Policy. Strict in production. In development, Vite's dev server
 * needs inline styles and a WebSocket for hot reload, and nothing more.
 */
export function contentSecurityPolicy(mode: 'development' | 'production'): string {
  const development = mode === 'development';
  return [
    "default-src 'none'",
    "script-src 'self'",
    development ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    development ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}
