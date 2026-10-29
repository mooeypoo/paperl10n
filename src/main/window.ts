// SPDX-License-Identifier: GPL-3.0-or-later
// Window and session hardening. Pure functions over minimal interfaces, so they're unit-tested
// without starting Electron. See docs/adr/0006-process-model-and-ipc.md.
import type { BrowserWindowConstructorOptions } from 'electron';

export const WINDOW_TITLE = 'Paper Lion';

/**
 * The renderer runs sandboxed, isolated, without Node: AGENTS.md, Electron boundary. `iconPath` is
 * the window's icon (taskbar and window switcher on Linux and Windows).
 */
export function createWindowOptions(
  preloadPath: string,
  iconPath: string,
): BrowserWindowConstructorOptions {
  return {
    title: WINDOW_TITLE,
    icon: iconPath,
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  };
}

/** Whether `url` is the app's own renderer page (`trusted`), ignoring query and hash. */
export function isAppUrl(url: string | undefined, trusted: string): boolean {
  if (url === undefined || url === '') return false;
  let actual: URL;
  let expected: URL;
  try {
    actual = new URL(url);
    expected = new URL(trusted);
  } catch {
    return false;
  }
  if (actual.protocol !== expected.protocol) return false;
  if (actual.protocol === 'file:') return actual.pathname === expected.pathname;
  return actual.origin === expected.origin;
}

/** The parts of `WebContents` hardening needs. */
export interface HardenableContents {
  on(
    event: 'will-navigate',
    listener: (event: { preventDefault(): void; url: string }) => void,
  ): void;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
}

/** The app never navigates away from its own page and never opens windows. */
export function hardenContents(contents: HardenableContents, appUrl: string): void {
  contents.on('will-navigate', (event) => {
    if (!isAppUrl(event.url, appUrl)) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** The parts of `Session` hardening needs. */
export interface HardenableSession {
  setPermissionRequestHandler(
    handler: (contents: unknown, permission: string, callback: (granted: boolean) => void) => void,
  ): void;
  setPermissionCheckHandler(handler: () => boolean): void;
}

/** No camera, microphone, notifications, geolocation, …: Paper Lion needs none of them. */
export function hardenSession(session: HardenableSession): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
}
