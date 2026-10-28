// SPDX-License-Identifier: GPL-3.0-or-later
// The Electron renderer's entry point: mount the UI on the preload's API.
import { mountApp } from './mount';

const root = document.getElementById('app');
if (root !== null) mountApp(root, window.paperl10n);
