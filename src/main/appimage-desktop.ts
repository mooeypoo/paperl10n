// SPDX-License-Identifier: GPL-3.0-or-later
// An AppImage installs nothing, so GNOME on Wayland finds no desktop entry for the window and shows
// a grey icon in the taskbar (it ignores the icon a window sets for itself), and the app isn't in
// the applications menu. On each start from an AppImage, the app keeps its own entry and icon in
// the user's data folder, pointing at wherever the AppImage now is; `TryExec` hides the entry once
// the AppImage is deleted. As Plot Device does (its fix for the same thing).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

/** Marks an entry as the app's own, so it may replace it; any other `paperl10n.desktop` is left alone. */
const MARKER = 'X-Paperl10n-AppImage=true';

/** A desktop entry string value: backslashes doubled (Desktop Entry spec, "Possible value types"). */
const value = (text: string): string => text.replace(/\\/g, '\\\\');

/** One quoted argument of an `Exec` line: `"`, `` ` ``, `$`, and `\` escaped inside the quotes,
 * then as a string value. */
const execArgument = (path: string): string =>
  value(`"${path.replace(/["`$\\]/g, (char) => `\\${char}`)}"`);

/** The desktop entry for an AppImage at `appImage`, or `null` for a path no entry can hold (a line break). */
export function appImageDesktopEntry(appImage: string, icon: string): string | null {
  if (/[\r\n]/.test(appImage + icon)) return null;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Paper Lion',
    'Comment=Translate docs sites and app strings side by side',
    `TryExec=${value(appImage)}`,
    `Exec=${execArgument(appImage)} %U`,
    `Icon=${value(icon)}`,
    'Terminal=false',
    'Categories=Office;',
    // The window's app id (electron-builder's `desktopName`), so the taskbar matches it to this entry.
    'StartupWMClass=paperl10n',
    MARKER,
    '',
  ].join('\n');
}

/** `$XDG_DATA_HOME`, or `~/.local/share` when it's unset or not an absolute path (as the spec says). */
export function dataHome(env: NodeJS.ProcessEnv = process.env): string {
  const set = env.XDG_DATA_HOME;
  return set !== undefined && isAbsolute(set) ? set : join(homedir(), '.local/share');
}

async function writeAtomically(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

export type AppImageIntegration = 'written' | 'unchanged' | 'not-ours' | 'unsupported-path';

/** Writes (or refreshes) the AppImage's desktop entry and icon under `home`; nothing already current. */
export async function integrateAppImage(options: {
  readonly appImage: string;
  readonly icon: string;
  readonly home: string;
}): Promise<AppImageIntegration> {
  const iconPath = join(options.home, 'icons/hicolor/512x512/apps/paperl10n.png');
  const entryPath = join(options.home, 'applications/paperl10n.desktop');
  const entry = appImageDesktopEntry(options.appImage, iconPath);
  if (entry === null) return 'unsupported-path';
  const existing = await readFile(entryPath, 'utf8').catch(() => null);
  if (existing !== null && !existing.split(/\r?\n/).includes(MARKER)) return 'not-ours';

  const icon = await readFile(options.icon);
  const iconCurrent = (await readFile(iconPath).catch(() => null))?.equals(icon) ?? false;
  if (iconCurrent && existing === entry) return 'unchanged';
  if (!iconCurrent) await writeAtomically(iconPath, icon);
  if (existing !== entry) await writeAtomically(entryPath, entry);
  return 'written';
}
