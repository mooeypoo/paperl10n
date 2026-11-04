// SPDX-License-Identifier: GPL-3.0-or-later
// Update notices in the real, built Electron app (ADR 0018), from a local server standing in for
// GitHub (PAPERL10N_TEST_UPDATE_URL, which a release ignores). No network.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { electronEnv } from '../../scripts/electron-env.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const page = 'https://github.com/mooeypoo/paperl10n/releases/tag/v99.0.0';
const latest = JSON.stringify({
  format: 1,
  version: '99.0.0',
  date: '2026-12-01',
  notes: page,
  download: { en: page },
});

let server: Server;
let requests: number;
let serverUrl: string;
let profile: string;
let app: ElectronApplication | undefined;

test.beforeEach(async () => {
  requests = 0;
  server = createServer((_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(latest);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/latest.json`;
  profile = mkdtempSync(join(tmpdir(), 'paperl10n-e2e-updates-'));
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true });
});

/** Starts the app on the test profile, getting updates from the local server. */
async function launch() {
  const env = {
    ...Object.fromEntries(
      Object.entries(electronEnv(process.env)).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    PAPERL10N_TEST_UPDATE_URL: serverUrl,
  };
  app = await electron.launch({
    args: [`--user-data-dir=${profile}`, repoRoot],
    cwd: repoRoot,
    env,
  });
  return app.firstWindow();
}

async function restart() {
  await app?.close();
  return launch();
}

/** Waits until the page has main's update status: About's setting only shows once it has. */
async function statusLoaded(window: Awaited<ReturnType<typeof launch>>) {
  await window.getByRole('button', { name: 'About' }).click();
  const about = window.getByRole('dialog', { name: 'Paper Lion' });
  await expect(
    about.getByRole('checkbox', { name: 'Check for updates automatically' }),
  ).toBeVisible();
  await about.getByRole('button', { name: 'Close' }).click();
}

test('mentions a newer version; "Not now" holds across a restart, and asks once a day', async () => {
  let window = await launch();
  const notice = window.getByRole('button', { name: 'Update available' });
  await notice.click();
  await expect(window.getByText('Paper Lion 99.0.0 is out.')).toBeVisible();
  await expect(window.getByRole('link', { name: "What's new" })).toHaveAttribute('href', page);
  await window.getByRole('button', { name: 'Not now' }).click();
  await expect(notice).toBeHidden();

  window = await restart();
  await statusLoaded(window);
  await expect(window.getByRole('button', { name: 'Update available' })).toBeHidden();
  // The state is in the profile's updates.json; the check isn't due again the same day.
  const saved = JSON.parse(readFileSync(join(profile, 'updates.json'), 'utf8')) as {
    dismissed: string;
  };
  expect(saved.dismissed).toBe('99.0.0');
  expect(requests).toBe(1);
});

test('About checks on demand, and turning the daily check off hides the notice', async () => {
  const window = await launch();
  await expect(window.getByRole('button', { name: 'Update available' })).toBeVisible();
  await window.getByRole('button', { name: 'About' }).click();
  const about = window.getByRole('dialog', { name: 'Paper Lion' });
  await about.getByRole('button', { name: 'Check for updates' }).click();
  await expect(about.getByRole('status')).toHaveText('Paper Lion 99.0.0 is out.');
  expect(requests).toBe(2);

  await about.getByRole('checkbox', { name: 'Check for updates automatically' }).uncheck();
  await about.getByRole('button', { name: 'Close' }).click();
  await expect(window.getByRole('button', { name: 'Update available' })).toBeHidden();

  const restarted = await restart();
  await statusLoaded(restarted);
  await expect(restarted.getByRole('button', { name: 'Update available' })).toBeHidden();
  expect(requests).toBe(2);
});
