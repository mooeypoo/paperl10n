// SPDX-License-Identifier: GPL-3.0-or-later
// Runs an Electron tool (electron-vite, Playwright) with a clean environment; see electron-env.ts.
// Usage: node scripts/run-electron.ts <command> [args…]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { electronEnv } from './electron-env.ts';
import { APPARMOR_PROFILE, linuxSandboxWarning } from './linux-sandbox.ts';

function readOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}

function sandboxHelper(): { uid: number; mode: number } | undefined {
  try {
    // The electron package's main export is the path of its binary.
    const binary = createRequire(import.meta.url)('electron') as string;
    const helper = statSync(join(dirname(binary), 'chrome-sandbox'));
    return { uid: helper.uid, mode: helper.mode };
  } catch {
    return undefined;
  }
}

if (process.platform === 'linux') {
  const helper = sandboxHelper();
  const label = readOrUndefined('/proc/self/attr/current');
  const warning = linuxSandboxWarning({
    platform: process.platform,
    userNamespacesRestricted:
      readOrUndefined('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1',
    ...(helper === undefined ? {} : { sandboxHelper: helper }),
    profileInstalled: existsSync(APPARMOR_PROFILE),
    ...(label === undefined ? {} : { currentLabel: label }),
  });
  if (warning !== undefined) console.warn(`\n${warning}\n`);
}

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
