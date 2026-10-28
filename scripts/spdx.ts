// SPDX-License-Identifier: GPL-3.0-or-later
// Pure helpers for the SPDX header check. See docs/adr/0013-license-and-spdx-headers.md.

export const LICENSE_ID = 'GPL-3.0-or-later';

const TAG = 'SPDX-License-Identifier:';
const LINES_TO_SEARCH = 3;

const commentStyles: Readonly<Record<string, (text: string) => string>> = {
  ts: (text) => `// ${text}`,
  js: (text) => `// ${text}`,
  mjs: (text) => `// ${text}`,
  cjs: (text) => `// ${text}`,
  vue: (text) => `<!-- ${text} -->`,
  html: (text) => `<!-- ${text} -->`,
  css: (text) => `/* ${text} */`,
};

// Fixtures stand in for users' projects and must stay byte-exact.
const exemptPath = /^(?:tests\/fixtures\/|src\/plugins\/[^/]+\/fixtures\/)/;

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot + 1);
}

/** The header line a file should start with, or `undefined` if the file needs no header. */
export function headerFor(path: string): string | undefined {
  if (exemptPath.test(path)) return undefined;
  const style = commentStyles[extensionOf(path)];
  return style?.(`${TAG} ${LICENSE_ID}`);
}

export type HeaderStatus = 'ok' | 'missing' | 'other-license';

export function headerStatus(content: string): HeaderStatus {
  const firstLines = content.split('\n', LINES_TO_SEARCH);
  const tagged = firstLines.find((line) => line.includes(TAG));
  if (tagged === undefined) return 'missing';
  const id = tagged.slice(tagged.indexOf(TAG) + TAG.length).trim();
  return id.startsWith(LICENSE_ID) && !/[\w.+-]/.test(id.charAt(LICENSE_ID.length))
    ? 'ok'
    : 'other-license';
}

/** Inserts `header` at the top, after a shebang line if there is one. */
export function withHeader(content: string, header: string): string {
  if (content.startsWith('#!')) {
    const newline = content.indexOf('\n');
    if (newline === -1) return `${content}\n${header}\n`;
    return `${content.slice(0, newline + 1)}${header}\n${content.slice(newline + 1)}`;
  }
  return `${header}\n${content}`;
}
