// SPDX-License-Identifier: GPL-3.0-or-later
// Block fingerprints: what the status file keeps of the source, so a change can be noticed without
// keeping the source's text (docs/plan/M3-sections.md, question 1). Stored in committed files, so
// the normalization and the hash are part of the status file's format: changing either is a new
// format version.

/**
 * A block's text without what doesn't change its meaning: line endings (CRLF and CR read as LF)
 * and whitespace at the ends of lines. Every other change, a typo fix included, counts.
 */
export function normalizedBlockText(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .join('\n');
}

const hex = (word: number) => (word >>> 0).toString(16).padStart(8, '0');

/**
 * A block's fingerprint: a 64-bit hash of its normalized text (over UTF-16 code units), as 16
 * lowercase hex digits. Not cryptographic: a collision would only hide a change.
 */
export function blockFingerprint(text: string): string {
  const normalized = normalizedBlockText(text);
  // cyrb53's mixing, with both 32-bit halves kept.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < normalized.length; index++) {
    const unit = normalized.charCodeAt(index);
    h1 = Math.imul(h1 ^ unit, 2654435761);
    h2 = Math.imul(h2 ^ unit, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return hex(h2) + hex(h1);
}
