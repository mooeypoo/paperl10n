// SPDX-License-Identifier: GPL-3.0-or-later
// The packaged app, as a translator installs it (M6): it starts under its own name and version,
// its renderer runs in Chromium's sandbox, the security policy holds inside the packaged app
// (asar), and it opens a project and saves a translation. Run after `pnpm package:dir`.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { electronEnv } from '../../scripts/electron-env.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const executable =
  process.env.PAPERL10N_PACKAGED ??
  join(
    repoRoot,
    'dist',
    process.platform === 'win32' ? 'win-unpacked/paperl10n.exe' : 'linux-unpacked/paperl10n',
  );
const basicFixture = join(repoRoot, 'src/plugins/format-stub/fixtures/basic');

/**
 * Ubuntu 23.10+ blocks the sandbox for a program without an AppArmor profile, and the unpacked
 * app has none. Where that's so on a developer's machine, the app starts with --no-sandbox; CI
 * lifts the restriction for the unpacked app instead, so the sandbox stays on there (as Plot
 * Device's packaged tests do). The installed .deb has its own profile (/etc/apparmor.d/paperl10n),
 * so it's tested with the restriction on: that's what translators get.
 */
function sandboxBlocked(): boolean {
  if (process.platform !== 'linux') return false;
  if (executable.startsWith('/opt/') && existsSync('/etc/apparmor.d/paperl10n')) return false;
  try {
    return (
      readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
    );
  } catch {
    return false;
  }
}

const env = Object.fromEntries(
  Object.entries(electronEnv(process.env)).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);

let app: ElectronApplication | undefined;
let profile = '';
let page: Page;
let messages: string[] = [];

test.beforeEach(async () => {
  profile = mkdtempSync(join(tmpdir(), 'paperl10n-packaged-'));
  // A release checks GitHub for updates (ADR 0018): a check made just now means none is due, so
  // the tests stay off the network.
  writeFileSync(
    join(profile, 'updates.json'),
    JSON.stringify({ checkedAt: Date.now(), latest: null, dismissed: null, automatic: true }),
  );
  messages = [];
  app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`, ...(sandboxBlocked() ? ['--no-sandbox'] : [])],
    env,
  });
  page = await app.firstWindow();
  page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));
  await page.waitForLoadState('load');
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(profile, { recursive: true, force: true });
});

test('starts as Paper Lion, at its package’s version, packaged', async () => {
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  await expect(page).toHaveTitle('Paper Lion');
  const facts = await app?.evaluate(({ app: electronApp }) => ({
    version: electronApp.getVersion(),
    name: electronApp.getName(),
    packaged: electronApp.isPackaged,
  }));
  // Electron names the app by its productName; the executable and desktop entry are `paperl10n`.
  expect(facts).toEqual({ version, name: 'Paper Lion', packaged: true });
});

test('its renderer runs in Chromium’s sandbox', async () => {
  test.skip(process.platform !== 'linux', 'reads /proc');
  test.skip(sandboxBlocked(), 'the sandbox is restricted on this machine (CI lifts it)');
  const pid = await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId(),
  );
  expect(readFileSync(`/proc/${String(pid)}/status`, 'utf8')).toMatch(/^Seccomp:\s+2$/m);
});

test('opens a project and saves a translation, with the security policy holding', async () => {
  const project = join(profile, 'basic');
  cpSync(basicFixture, project, { recursive: true, verbatimSymlinks: true });
  await app?.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('button', { name: 'Start translating' }).click();
  await page.getByRole('textbox', { name: 'עברית · translation' }).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('מתחילים ');
  await page.keyboard.press('Control+S');
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(readFileSync(join(project, 'he/guide/getting-started.md'), 'utf8')).toMatch(/^מתחילים /);
  expect(messages.filter((message) => /Content.Security.Policy/i.test(message))).toEqual([]);
});

test('About shows the version, the components it ships, and the full license', async () => {
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  const components = JSON.parse(
    readFileSync(join(repoRoot, 'build/third-party-licenses.json'), 'utf8'),
  ) as unknown[];
  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'Paper Lion' });
  await expect(about.getByTestId('about-version')).toHaveText(`Version ${version}`);
  // Read from the files beside the app (extraResources), not from the repository.
  await expect(
    about.getByText(`Open-source components (${String(components.length)})`),
  ).toBeVisible();
  await about.getByText('The full license (in English)').click();
  await expect(about.locator('pre')).toContainText('GNU GENERAL PUBLIC LICENSE');
});

test('has the daily update check on, and no notice without a newer release', async () => {
  await page.getByRole('button', { name: 'About' }).click();
  const about = page.getByRole('dialog', { name: 'Paper Lion' });
  await expect(
    about.getByRole('checkbox', { name: 'Check for updates automatically' }),
  ).toBeChecked();
  await expect(page.getByRole('button', { name: 'Update available' })).toBeHidden();
  const saved = JSON.parse(readFileSync(join(profile, 'updates.json'), 'utf8')) as {
    latest: unknown;
  };
  expect(saved.latest).toBeNull();
});
