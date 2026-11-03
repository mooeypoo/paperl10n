// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appImageDesktopEntry, dataHome, integrateAppImage } from './appimage-desktop.ts';

/** AppImages and desktop entries are Linux only; their paths are POSIX paths. */
const isPosix = process.platform !== 'win32';

let base = '';
let home = '';
let icon = '';
const entryPath = () => join(home, 'applications/paperl10n.desktop');
const iconPath = () => join(home, 'icons/hicolor/512x512/apps/paperl10n.png');

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'paperl10n-appimage-'));
  home = join(base, 'share');
  icon = join(base, 'icon.png');
  await writeFile(icon, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
});
afterEach(() => rm(base, { recursive: true, force: true }));

describe('the AppImage’s desktop entry', () => {
  it('runs the AppImage, shows the icon, and matches the window by its app id', () => {
    const entry = appImageDesktopEntry(
      '/home/noa/Apps/paperl10n-0.1.0.AppImage',
      '/home/noa/.local/share/icons/paperl10n.png',
    );
    expect(entry).toContain('\nExec="/home/noa/Apps/paperl10n-0.1.0.AppImage" %U\n');
    expect(entry).toContain('\nTryExec=/home/noa/Apps/paperl10n-0.1.0.AppImage\n');
    expect(entry).toContain('\nIcon=/home/noa/.local/share/icons/paperl10n.png\n');
    expect(entry).toContain('\nStartupWMClass=paperl10n\n');
  });

  it('quotes paths with spaces, Hebrew, dollar signs, quotes and backslashes as the spec asks', () => {
    const entry = appImageDesktopEntry('/home/u/תרגומים/My "$HOME" \\ app.AppImage', '/i.png');
    expect(entry).toContain(
      '\nExec="/home/u/תרגומים/My \\\\"\\\\$HOME\\\\" \\\\\\\\ app.AppImage" %U\n',
    );
    expect(entry).toContain('\nTryExec=/home/u/תרגומים/My "$HOME" \\\\ app.AppImage\n');
  });

  it('refuses a path with a line break, which no entry can hold', () => {
    expect(appImageDesktopEntry('/tmp/evil\nExec=rm', '/i.png')).toBeNull();
  });
});

describe.runIf(isPosix)('keeping the entry in the user’s data folder', () => {
  it('writes the entry and the icon, then writes nothing while they are current', async () => {
    expect(await integrateAppImage({ appImage: '/apps/paperl10n.AppImage', icon, home })).toBe(
      'written',
    );
    expect(await readFile(entryPath(), 'utf8')).toContain('Exec="/apps/paperl10n.AppImage" %U');
    expect(await readFile(entryPath(), 'utf8')).toContain(`Icon=${iconPath()}`);
    expect(await readFile(iconPath())).toEqual(await readFile(icon));
    const written = (await stat(entryPath())).mtimeMs;

    expect(await integrateAppImage({ appImage: '/apps/paperl10n.AppImage', icon, home })).toBe(
      'unchanged',
    );
    expect((await stat(entryPath())).mtimeMs).toBe(written);
  });

  it('follows the AppImage when it moves, and a newer icon', async () => {
    await integrateAppImage({ appImage: '/old/paperl10n.AppImage', icon, home });
    await writeFile(icon, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
    expect(await integrateAppImage({ appImage: '/new/paperl10n.AppImage', icon, home })).toBe(
      'written',
    );
    expect(await readFile(entryPath(), 'utf8')).toContain('Exec="/new/paperl10n.AppImage" %U');
    expect(await readFile(iconPath())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
  });

  it('leaves alone a paperl10n.desktop it did not write', async () => {
    await mkdir(join(home, 'applications'), { recursive: true });
    await writeFile(entryPath(), '[Desktop Entry]\nName=My own launcher\nExec=/opt/mine\n');
    expect(await integrateAppImage({ appImage: '/apps/paperl10n.AppImage', icon, home })).toBe(
      'not-ours',
    );
    expect(await readFile(entryPath(), 'utf8')).toBe(
      '[Desktop Entry]\nName=My own launcher\nExec=/opt/mine\n',
    );
    await expect(stat(iconPath())).rejects.toThrow();
  });
});

describe.runIf(isPosix)('the user’s data folder', () => {
  it('is $XDG_DATA_HOME when it is an absolute path, and ~/.local/share otherwise', () => {
    expect(dataHome({ XDG_DATA_HOME: '/data/noa' })).toBe('/data/noa');
    expect(dataHome({ XDG_DATA_HOME: 'relative' })).toMatch(/\.local\/share$/);
    expect(dataHome({})).toMatch(/\.local\/share$/);
  });
});
