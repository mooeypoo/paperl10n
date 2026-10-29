// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICON_SIZES, iconFile, pngSize } from './app-icons.ts';

/** A PNG's first 24 bytes: the signature, then an IHDR chunk with the given size. */
function pngHeader(width: number, height: number, chunk = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode(chunk), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('pngSize', () => {
  it.each<[string, Uint8Array, { width: number; height: number } | null]>([
    ['a PNG header', pngHeader(512, 256), { width: 512, height: 256 }],
    ['too short', pngHeader(16, 16).subarray(0, 23), null],
    ['not a PNG signature', Uint8Array.from([0x47, ...pngHeader(16, 16).subarray(1)]), null],
    ['no IHDR first', pngHeader(16, 16, 'IDAT'), null],
    ['empty', new Uint8Array(), null],
  ])('%s', (_name, bytes, expected) => {
    expect(pngSize(bytes)).toEqual(expected);
  });
});

describe('the committed app icons (scripts/render-app-icons.ts)', () => {
  it.each(ICON_SIZES)('%i px exists, as a PNG of that size', (size) => {
    const bytes = readFileSync(new URL(`../${iconFile(size)}`, import.meta.url));
    expect(pngSize(bytes)).toEqual({ width: size, height: size });
  });
});
