// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The environment to start Electron with. `ELECTRON_RUN_AS_NODE` (set by VS Code for processes its
 * extensions spawn, including coding agents) makes the Electron binary behave as plain Node, and
 * the app then fails with a misleading "no export named BrowserWindow". It's never wanted here.
 */
export function electronEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env };
  delete clean.ELECTRON_RUN_AS_NODE;
  return clean;
}
