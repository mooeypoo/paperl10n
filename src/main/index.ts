// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron main process: app lifecycle and wiring. Thin on purpose; the logic lives in
// window.ts, ipc.ts, and the app's composition root.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { createElectronAppApi } from '#app/node/composition-root';
import { dataHome, integrateAppImage } from './appimage-desktop.ts';
import { registerApi, trustedSenderCheck } from './ipc.ts';
import { createWindowOptions, hardenContents, hardenSession, isAppUrl } from './window.ts';

const APP_ID = 'io.github.mooeypoo.paperl10n';

// Identifiers use "paperl10n"; "Paper Lion" is only for display (AGENTS.md naming). A release
// keeps its settings and drafts in `paperl10n`; running from the repository (`pnpm dev`) uses
// `paperl10n-dev`, so trying a release never mixes with a development profile (M6). Chromium's
// --user-data-dir still wins, for a separate profile (each end-to-end test runs in its own).
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const folder = app.isPackaged ? 'paperl10n' : 'paperl10n-dev';
  app.setPath('userData', join(app.getPath('appData'), folder));
}
app.setAppUserModelId(APP_ID);
app.enableSandbox();

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
// Tests only: update notices from a local server (ADR 0018). A release ignores it.
const testUpdateUrl = app.isPackaged ? undefined : process.env.PAPERL10N_TEST_UPDATE_URL;
const rendererFile = join(import.meta.dirname, '../renderer/index.html');
const appUrl = devServerUrl ?? pathToFileURL(rendererFile).href;

// The mark, rendered by scripts/render-app-icons.ts. The packaged app carries it too (electron-
// builder.yml's `files`); installers also get their own icon formats from the same folder.
const iconPath = join(app.getAppPath(), 'assets/icons/512x512.png');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const window = new BrowserWindow(
    createWindowOptions(join(import.meta.dirname, '../preload/index.cjs'), iconPath),
  );
  hardenContents(window.webContents, appUrl, (url) => {
    void shell.openExternal(url);
  });
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
  // macOS shows the dock icon, not the window's.
  app.dock?.setIcon(iconPath);

  // A release keeps the licence and the components list beside the app (electron-builder's
  // extraResources); from the repository they're its LICENSE and what `pnpm build` wrote.
  const aboutFolder = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const api = createElectronAppApi({
    about: {
      name: app.getName(),
      version: app.getVersion(),
      licenseFile: join(aboutFolder, 'LICENSE'),
      componentsFile: app.isPackaged
        ? join(aboutFolder, 'third-party-licenses.json')
        : join(aboutFolder, 'build/third-party-licenses.json'),
    },
    showFolderDialog: async () => {
      const options = { properties: ['openDirectory' as const], title: 'Open project folder' };
      return mainWindow === null
        ? dialog.showOpenDialog(options)
        : dialog.showOpenDialog(mainWindow, options);
    },
    updates: {
      testServer: testUpdateUrl,
      stateFile: join(app.getPath('userData'), 'updates.json'),
      automaticAllowed: app.isPackaged || testUpdateUrl !== undefined,
    },
    draftsFolder: join(app.getPath('userData'), 'drafts'),
    catalogDraftsFolder: join(app.getPath('userData'), 'catalog-drafts'),
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
  // Started from an AppImage: keep its desktop entry and icon current (see appimage-desktop.ts).
  // Help, not the app's work: a failure is logged, never shown.
  const appImage = process.env.APPIMAGE;
  if (process.platform === 'linux' && appImage !== undefined && app.isPackaged) {
    void integrateAppImage({ appImage, icon: iconPath, home: dataHome() }).catch(
      (error: unknown) => {
        console.warn('[paperl10n] could not keep the AppImage’s desktop entry:', error);
      },
    );
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void start();
