// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron main process: app lifecycle and wiring. Thin on purpose; the logic lives in
// window.ts, ipc.ts, and the app's composition root.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { createElectronAppApi } from '#app/node/composition-root';
import { registerApi, trustedSenderCheck } from './ipc.ts';
import { createWindowOptions, hardenContents, hardenSession, isAppUrl } from './window.ts';

const APP_ID = 'io.github.mooeypoo.paperl10n';

// Identifiers use "paperl10n"; "Paper Lion" is only for display (AGENTS.md naming).
app.setPath('userData', join(app.getPath('appData'), 'paperl10n'));
app.setAppUserModelId(APP_ID);
app.enableSandbox();

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const rendererFile = join(import.meta.dirname, '../renderer/index.html');
const appUrl = devServerUrl ?? pathToFileURL(rendererFile).href;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const window = new BrowserWindow(
    createWindowOptions(join(import.meta.dirname, '../preload/index.cjs')),
  );
  hardenContents(window.webContents, appUrl);
  window.once('ready-to-show', () => {
    window.show();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  void (devServerUrl === undefined ? window.loadFile(rendererFile) : window.loadURL(devServerUrl));
  mainWindow = window;
}

async function start(): Promise<void> {
  await app.whenReady();
  hardenSession(session.defaultSession);

  const api = createElectronAppApi({
    showFolderDialog: async () => {
      const options = { properties: ['openDirectory' as const], title: 'Open project folder' };
      return mainWindow === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(mainWindow, options);
    },
    onUnexpected: (method, thrown) => {
      console.error(`[paperl10n] unexpected error in ${method}:`, thrown);
    },
  });
  if (!api.ok) {
    // A broken plugin set is a bug: say so clearly and stop, instead of running half-working.
    dialog.showErrorBox('Paper Lion could not start', JSON.stringify(api.error, null, 2));
    app.exit(1);
    return;
  }

  registerApi(
    ipcMain,
    api.value,
    trustedSenderCheck((url) => isAppUrl(url, appUrl)),
    (method, reason) => {
      console.warn(`[paperl10n] rejected ${method}: ${reason}`);
    },
  );

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void start();
