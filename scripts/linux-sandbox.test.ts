// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apparmorProfile, linuxSandboxWarning, type SandboxFacts } from './linux-sandbox.ts';

const restricted: SandboxFacts = {
  platform: 'linux',
  userNamespacesRestricted: true,
  sandboxHelper: { uid: 1000, mode: 0o100755 },
  profileInstalled: false,
  currentLabel: 'unconfined',
};

describe('linuxSandboxWarning', () => {
  it('warns on a restricted Linux system without any fix in place', () => {
    expect(linuxSandboxWarning(restricted)).toContain('docs/development/linux-sandbox.md');
  });

  it('warns when the helper and label are unknown', () => {
    const unknown: SandboxFacts = {
      platform: 'linux',
      userNamespacesRestricted: true,
      profileInstalled: false,
    };
    expect(linuxSandboxWarning(unknown)).toBeDefined();
  });

  it.each<[string, Partial<SandboxFacts>]>([
    ['on macOS', { platform: 'darwin' }],
    ['on Windows', { platform: 'win32' }],
    ['when user namespaces are not restricted', { userNamespacesRestricted: false }],
    ['when the AppArmor profile is installed', { profileInstalled: true }],
    ['when chrome-sandbox is setuid root', { sandboxHelper: { uid: 0, mode: 0o104755 } }],
    ["when running under a profile such as VS Code's", { currentLabel: 'vscode (unconfined)' }],
  ])('stays quiet %s', (_description, change) => {
    expect(linuxSandboxWarning({ ...restricted, ...change })).toBeUndefined();
  });

  it('still warns when chrome-sandbox is root-owned but not setuid', () => {
    expect(
      linuxSandboxWarning({ ...restricted, sandboxHelper: { uid: 0, mode: 0o100755 } }),
    ).toBeDefined();
  });
});

describe('apparmorProfile', () => {
  it("allows user namespaces for this clone's Electron binary, under pnpm's real path", () => {
    const profile = apparmorProfile('/work/paperl10n');
    expect(profile).toContain(
      'profile paperl10n-electron /work/paperl10n/node_modules/.pnpm/electron@*/node_modules/electron/dist/electron flags=(unconfined) {',
    );
    expect(profile).toContain('  userns,\n');
  });

  it('is the profile the linux-sandbox doc tells people to install', () => {
    const doc = readFileSync(
      new URL('../docs/development/linux-sandbox.md', import.meta.url),
      'utf8',
    );
    expect(doc).toContain(apparmorProfile('/home/USER/PATH/TO/paperl10n'));
  });
});
