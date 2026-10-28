// SPDX-License-Identifier: GPL-3.0-or-later
// Prints the AppArmor profile for this clone's Electron (docs/development/linux-sandbox.md).
// Usage: node scripts/print-apparmor-profile.ts | sudo tee /etc/apparmor.d/paperl10n-electron
import { fileURLToPath } from 'node:url';
import { apparmorProfile } from './linux-sandbox.ts';

process.stdout.write(
  apparmorProfile(fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')),
);
