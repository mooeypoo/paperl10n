# Electron's sandbox on Ubuntu 23.10+ (and similar)

## The symptom

`pnpm dev` aborts with:

```
FATAL:setuid_sandbox_host.cc: The SUID sandbox helper binary was found, but is not configured
correctly. Rather than run without sandboxing I'm aborting now.
```

## Why

Paper Lion's renderer always runs in Chromium's sandbox (ADR 0006). The sandbox needs
unprivileged user namespaces. Ubuntu 23.10 and later restrict those through AppArmor
(`kernel.apparmor_restrict_unprivileged_userns=1`) unless the program has an AppArmor profile that
allows them. A `node_modules/` copy of Electron has no such profile, so Chromium stops rather than
run without its sandbox. That's the right behavior.

It works from VS Code's integrated terminal because Ubuntu ships a `vscode` profile that allows
user namespaces, and programs started from it inherit it.

## Fix (once per machine): an AppArmor profile for this project's Electron

```sh
sudo tee /etc/apparmor.d/paperl10n-electron > /dev/null <<'PROFILE'
abi <abi/4.0>,
include <tunables/global>

profile paperl10n-electron /home/USER/PATH/TO/paperl10n/node_modules/.pnpm/electron@*/node_modules/electron/dist/electron flags=(unconfined) {
  userns,
  include if exists <local/paperl10n-electron>
}
PROFILE
sudo apparmor_parser -r /etc/apparmor.d/paperl10n-electron
```

Replace `/home/USER/PATH/TO/paperl10n` with your clone's path. AppArmor matches the binary's
**real** path, which with pnpm is under `node_modules/.pnpm/electron@<version>/`. The
`electron@*` glob keeps working after Electron upgrades. `pnpm dev` stops warning once the profile
file exists.

## Alternative: a setuid sandbox helper (resets on reinstall)

```sh
helper="$(dirname "$(node -p "require('electron')")")/chrome-sandbox"
sudo chown root:root "$helper" && sudo chmod 4755 "$helper"
```

Reinstalling `node_modules/` (or upgrading Electron) undoes this.

## Don't

- **`--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`:** it turns off the renderer's isolation, which
  the whole security model relies on.
- **`sysctl kernel.apparmor_restrict_unprivileged_userns=0`:** it weakens this protection for every
  program on the machine.

## CI

GitHub's Ubuntu runners need the same treatment for the Electron end-to-end test (M0 step 15).
There it happens in the ephemeral runner, with the setuid helper or a profile, never
`--no-sandbox`.
