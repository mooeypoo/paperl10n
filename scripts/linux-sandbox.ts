// SPDX-License-Identifier: GPL-3.0-or-later
// Explains, before Electron aborts, why its sandbox may not start on Ubuntu 23.10+ and similar
// systems. See docs/development/linux-sandbox.md.

export const APPARMOR_PROFILE = '/etc/apparmor.d/paperl10n-electron';

export interface SandboxFacts {
  readonly platform: string;
  /** `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` is `1`. */
  readonly userNamespacesRestricted: boolean;
  /** Owner and mode of Electron's `chrome-sandbox` helper, if found. */
  readonly sandboxHelper?: { readonly uid: number; readonly mode: number };
  readonly profileInstalled: boolean;
  /** AppArmor label of this process, e.g. "vscode (unconfined)". Children inherit it. */
  readonly currentLabel?: string;
}

/** A warning to print, or `undefined` when Electron's sandbox should start. */
export function linuxSandboxWarning(facts: SandboxFacts): string | undefined {
  if (facts.platform !== 'linux' || !facts.userNamespacesRestricted || facts.profileInstalled) {
    return undefined;
  }
  const helper = facts.sandboxHelper;
  if (helper !== undefined && helper.uid === 0 && (helper.mode & 0o4000) !== 0) return undefined;
  // A process running under a profile that allows user namespaces (VS Code's "vscode" profile,
  // for example) passes that on to Electron.
  if (facts.currentLabel !== undefined && !facts.currentLabel.startsWith('unconfined'))
    return undefined;
  return [
    'Electron may refuse to start: this system restricts unprivileged user namespaces',
    "(kernel.apparmor_restrict_unprivileged_userns=1), which Chromium's sandbox needs.",
    'Paper Lion never runs without its sandbox. One-time fix (an AppArmor profile for Electron):',
    '  docs/development/linux-sandbox.md',
  ].join('\n');
}
