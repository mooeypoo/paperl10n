// SPDX-License-Identifier: GPL-3.0-or-later
// The walking skeleton in the real, built Electron app: sandboxed renderer, preload, IPC, main,
// the disk adapter, and format-stub. Only the native folder dialog is stubbed (in main).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
import { apiMethods } from '#ipc-contract';
import { electronEnv } from '../../scripts/electron-env.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const basicFixture = fileURLToPath(
  new URL('../../src/plugins/format-stub/fixtures/basic', import.meta.url),
);

interface Problems {
  /** Console errors and warnings from the renderer, including CSP reports. */
  readonly console: string[];
  /** `securitypolicyviolation` events: what the CSP blocked. */
  violations(): Promise<string[]>;
}

/** The environment without ELECTRON_RUN_AS_NODE (the runner script removes it too). */
const env = Object.fromEntries(
  Object.entries(electronEnv(process.env)).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);

let app: ElectronApplication;
let profile: string;
let page: Page;
let problems: Problems;

test.beforeEach(async () => {
  // A fresh profile per test: tests never read or write the developer's real app profile (and a
  // running `pnpm dev` holding its storage lock can't slow them down).
  profile = mkdtempSync(join(tmpdir(), 'paperl10n-e2e-'));
  app = await electron.launch({
    args: [`--user-data-dir=${profile}`, repoRoot],
    cwd: repoRoot,
    env,
  });
  page = await app.firstWindow();

  // Watch for CSP violations and console errors from the very first script: register the
  // listeners, then reload the page so they see it load. (The navigation lock allows reloads.)
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
  await page.context().addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, '__paperl10nCspViolations', { value: seen });
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} blocked ${event.blockedURI}`);
    });
  });
  await page.reload();
  await page.waitForLoadState('load');
  problems = {
    console: consoleProblems,
    violations: () =>
      page.evaluate(() => [
        ...(window as unknown as { __paperl10nCspViolations: string[] }).__paperl10nCspViolations,
      ]),
  };
});

test.afterEach(async () => {
  await app.close();
  rmSync(profile, { recursive: true, force: true });
});

/** Makes the next folder dialog in main answer `folder`, as if the user had picked it. */
async function stubFolderDialog(folder: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [picked] });
  }, folder);
}

test('opens a project and shows both panes with their own lang and dir', async () => {
  await expect(page).toHaveTitle('Paper Lion');
  await stubFolderDialog(basicFixture);
  await page.getByRole('button', { name: 'Open folder…' }).click();

  const panes = page.locator('section');
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0)).toHaveAttribute('lang', 'en');
  await expect(panes.nth(0)).toHaveAttribute('dir', 'ltr');
  await expect(panes.nth(1)).toHaveAttribute('lang', 'he');
  await expect(panes.nth(1)).toHaveAttribute('dir', 'rtl');
  await expect(panes.nth(0)).toContainText('en/guide/getting-started.md');
  await expect(panes.nth(1)).toContainText('he/guide/getting-started.md');

  expect(await problems.violations()).toEqual([]);
  expect(problems.console).toEqual([]);
});

test('the renderer has no Node, and the preload exposes exactly the IPC contract', async () => {
  const globals = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>).require,
    process: typeof (globalThis as Record<string, unknown>).process,
    module: typeof (globalThis as Record<string, unknown>).module,
    Buffer: typeof (globalThis as Record<string, unknown>).Buffer,
    global: typeof (globalThis as Record<string, unknown>).global,
  }));
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    Buffer: 'undefined',
    global: 'undefined',
  });
  const exposed = await page.evaluate(() =>
    Object.keys((window as unknown as { paperl10n: object }).paperl10n).sort(),
  );
  expect(exposed).toEqual([...apiMethods].sort());
});

test('runs in its own profile, not the real one', async () => {
  expect(await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))).toBe(
    profile,
  );
});

test("the renderer process runs in Chromium's sandbox", async () => {
  test.skip(process.platform !== 'linux', 'reads /proc');
  // Chromium's Linux sandbox puts renderers under a seccomp-bpf filter ("Seccomp: 2"); an
  // unsandboxed renderer has none ("Seccomp: 0"). Electron ignores --no-sandbox and
  // ELECTRON_DISABLE_SANDBOX here (app.enableSandbox()), so only a code change could turn it off.
  const pid = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId(),
  );
  const status = readFileSync(`/proc/${String(pid)}/status`, 'utf8');
  expect(status).toMatch(/^Seccomp:\s+2$/m);
});

test('a CSP violation would be caught (positive control for the checks above)', async () => {
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'https://example.invalid/tracker.png';
    document.body.append(image);
  });
  await expect
    .poll(() => problems.violations())
    .toContain('img-src blocked https://example.invalid/tracker.png');
});
