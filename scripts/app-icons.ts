// SPDX-License-Identifier: GPL-3.0-or-later
// The app icon's PNG sizes, rendered from the mark by render-app-icons.ts, and a reader for a
// PNG's size (so tests can check the committed files without decoding them).

/** Square sizes in pixels: window and taskbar icons now, Linux's hicolor set when packaging. */
export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512] as const;

export const ICON_FOLDER = 'assets/icons';

export const iconFile = (size: number): string => `${ICON_FOLDER}/paperl10n-${String(size)}.png`;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's width and height (from its IHDR chunk), or `null` when the bytes aren't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
