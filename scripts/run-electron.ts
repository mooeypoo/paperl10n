// SPDX-License-Identifier: GPL-3.0-or-later
// Runs an Electron tool (electron-vite, Playwright) with a clean environment; see electron-env.ts.
// Usage: node scripts/run-electron.ts <command> [args…]
import { spawn } from 'node:child_process';
import { electronEnv } from './electron-env.ts';

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
  console.error('usage: node scripts/run-electron.ts <command> [args…]');
  process.exit(2);
}

const child = spawn(command, args, {
  env: electronEnv(process.env),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === null ? 1 : 128);
});
