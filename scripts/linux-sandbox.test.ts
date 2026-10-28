// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { linuxSandboxWarning, type SandboxFacts } from './linux-sandbox.ts';

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
