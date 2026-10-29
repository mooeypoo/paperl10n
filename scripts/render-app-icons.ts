// SPDX-License-Identifier: GPL-3.0-or-later
// Renders the mark (assets/paperl10n-mark.svg, unmodified) into the app icon's PNG sizes, with
// the Electron the project already has: no rasterizer dependency. Rerun when the mark changes.
// Usage: node scripts/run-electron.ts electron scripts/render-app-icons.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, type NativeImage } from 'electron';
import { ICON_FOLDER, ICON_SIZES, iconFile } from './app-icons.ts';

const root = join(import.meta.dirname, '..');
const svg = readFileSync(join(root, 'assets/paperl10n-mark.svg'));
const page = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const LARGEST = Math.max(...ICON_SIZES);

/** Renders the mark once, at the largest size, in an offscreen window with a clear background. */
async function renderLargest(): Promise<NativeImage> {
  const window = new BrowserWindow({
    show: false,
    width: LARGEST,
    height: LARGEST,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  try {
    // An offscreen window hands over each frame it paints; the first one after loading is the mark.
    const painted = new Promise<NativeImage>((resolve) => {
      window.webContents.on('paint', (_event, _dirty, frame) => {
        if (!frame.isEmpty()) resolve(frame);
      });
    });
    await window.loadURL(page);
    return await painted;
  } finally {
    window.destroy();
  }
}

/** The mark at `size`, scaled from the large render, checked for the obvious ways to go wrong. */
function sized(large: NativeImage, size: number): Buffer {
  const image = large.resize({ width: size, height: size, quality: 'best' });
  // The mark fills the middle and leaves the corners clear: anything else means a bad render.
  const bitmap = image.toBitmap();
  const alpha = (x: number, y: number) => bitmap[(y * size + x) * 4 + 3] ?? 0;
  const middle = Math.floor(size / 2);
  if (image.getSize().width !== size || alpha(middle, middle) < 250 || alpha(0, 0) > 5) {
    throw new Error(`the ${String(size)} px icon looks wrong (size, middle, or corner)`);
  }
  return image.toPNG();
}

async function renderAll(): Promise<void> {
  const large = await renderLargest();
  mkdirSync(join(root, ICON_FOLDER), { recursive: true });
  for (const size of ICON_SIZES) {
    writeFileSync(join(root, iconFile(size)), sized(large, size));
    console.log(`wrote ${iconFile(size)}`);
  }
}

// Not a top-level await: an ES module main's `ready` waits for the module to finish evaluating.
// `app.exit` sets the exit code (`app.quit` ignores `process.exitCode`).
app
  .whenReady()
  .then(renderAll)
  .then(
    () => {
      app.exit(0);
    },
    (error: unknown) => {
      console.error(error);
      app.exit(1);
    },
  );
