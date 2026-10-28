// SPDX-License-Identifier: GPL-3.0-or-later
// Runs in the sandboxed renderer before the page. Exposes the IPC contract as window.paperl10n,
// and nothing else: no Node, no ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { createApi } from './create-api.ts';

contextBridge.exposeInMainWorld(
  'paperl10n',
  createApi((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
);
