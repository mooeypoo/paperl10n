// SPDX-License-Identifier: GPL-3.0-or-later
// The walking skeleton in the real, built Electron app: sandboxed renderer, preload, IPC, main,
// the disk adapter, and format-stub. Only the native folder dialog is stubbed (in main).
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  // Destroying the windows skips their unload handlers, so a test that leaves unsaved changes
  // can't hold the app open with the unsaved-changes question. (A window may be closed already.)
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    })
    .catch(() => undefined);
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

test('edits the translation in its own direction, with CodeMirror styled under the strict CSP', async () => {
  await stubFolderDialog(basicFixture);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  // The page with a translation.
  await page.locator('nav').getByText('index', { exact: true }).click();

  // Playwright's role locators reach into the editors' shadow roots.
  const source = page.getByRole('textbox', { name: 'English · source' });
  const target = page.getByRole('textbox', { name: 'עברית · translation' });
  await expect(source).toHaveAttribute('aria-readonly', 'true');
  await expect(target).toHaveAttribute('dir', 'rtl');
  await expect(target).toHaveAttribute('lang', 'he');

  // CodeMirror's base theme applied (a constructed sheet in the shadow root): .cm-editor is flex.
  expect(
    await target.evaluate((element) => {
      const editor = element.closest('.cm-editor');
      return editor === null ? null : getComputedStyle(editor).display;
    }),
  ).toBe('flex');

  // Typing at the end of the first line lands in the text.
  await target.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.type(' נוסף');
  await expect(target.locator('.cm-line').first()).toContainText('נוסף');
  // The source can't be changed.
  const before = await source.textContent();
  await source.click();
  await page.keyboard.type('x');
  expect(await source.textContent()).toBe(before);

  expect(await problems.violations()).toEqual([]);
  expect(problems.console).toEqual([]);
});

test('asks for a target language when the project has none, and saves the choice', async () => {
  // A copy without a target: choosing one writes to the config, never to the fixture.
  const project = join(profile, 'no-target');
  cpSync(basicFixture, project, { recursive: true, verbatimSymlinks: true });
  const config = join(project, 'paperl10n.config.json');
  writeFileSync(config, '{\n  "sourceLocale": "en",\n  "documentFormat": "format-stub"\n}\n');
  await stubFolderDialog(project);
  await page.getByRole('button', { name: 'Open folder…' }).click();

  const picker = page.getByRole('dialog', { name: 'Choose the translation language' });
  await expect(picker).toBeVisible();
  const search = picker.getByRole('combobox', { name: 'Search languages' });
  await expect(search).toBeFocused();
  await expect(picker.getByRole('group', { name: 'In this project' })).toContainText('עברית');

  await search.fill('arab');
  await expect(picker.getByRole('option').first()).toContainText('العربية');
  await search.press('Enter');

  await expect(picker).toBeHidden();
  const panes = page.locator('section');
  await expect(panes.nth(1)).toHaveAttribute('lang', 'ar');
  await expect(panes.nth(1)).toHaveAttribute('dir', 'rtl');
  expect(readFileSync(config, 'utf8')).toBe(
    '{\n  "sourceLocale": "en",\n  "targetLocale": "ar",\n  "documentFormat": "format-stub"\n}\n',
  );
  expect(await problems.violations()).toEqual([]);
  expect(problems.console).toEqual([]);
});

/** A copy of the basic fixture in the test's profile folder, so saving never touches the fixture. */
async function openCopyOfBasic(): Promise<string> {
  const project = join(profile, 'basic');
  cpSync(basicFixture, project, { recursive: true, verbatimSymlinks: true });
  await stubFolderDialog(project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  return project;
}

test('starts a translation from the source and saves it with Ctrl+S, creating the file', async () => {
  const project = await openCopyOfBasic();
  const target = join(project, 'he/guide/getting-started.md');
  await page.getByRole('button', { name: 'Start translating' }).click();
  const editor = page.getByRole('textbox', { name: 'עברית · translation' });
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');

  await editor.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('מתחילים ');
  await page.keyboard.press('Control+S');
  await expect(page.getByRole('status')).toHaveText('Saved');
  const source = readFileSync(join(project, 'en/guide/getting-started.md'), 'utf8');
  expect(readFileSync(target, 'utf8')).toBe(`מתחילים ${source}`);

  expect(await problems.violations()).toEqual([]);
  expect(problems.console).toEqual([]);
});

test('asks before closing the window with unsaved changes, and closes on "Don\'t save"', async () => {
  await openCopyOfBasic();
  await page.locator('nav').getByText('index', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'עברית · translation' });
  await editor.click();
  await page.keyboard.type('!');
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');

  // Closing from outside the page (the window's close button) is held back, and the app asks.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  const question = page.getByRole('alertdialog', { name: 'Save your changes?' });
  await expect(question).toBeVisible();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toBeHidden();

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  const closed = page.waitForEvent('close');
  await question.getByRole('button', { name: "Don't save" }).click();
  await closed;
});

test('keeps unsaved edits as a draft, and restores them after a crash', async () => {
  const project = await openCopyOfBasic();
  await page.locator('nav').getByText('index', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'עברית · translation' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('טיוטה');
  // The draft lands in the app's data (this test's profile), never in the project.
  const drafts = join(profile, 'drafts');
  await expect.poll(() => (existsSync(drafts) ? readdirSync(drafts).length : 0)).toBe(1);
  const translation = readFileSync(join(project, 'he/index.md'), 'utf8');

  // A crash: the process dies without unload handlers or a goodbye.
  app.process().kill('SIGKILL');
  app = await electron.launch({
    args: [`--user-data-dir=${profile}`, repoRoot],
    cwd: repoRoot,
    env,
  });
  page = await app.firstWindow();
  await stubFolderDialog(project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await expect(
    page.locator('nav').getByRole('button', { name: /index.*Unsaved changes/ }),
  ).toBeVisible();
  await page.locator('nav').getByText('index', { exact: true }).click();
  await expect(
    page.getByText('Unsaved changes from your last session were restored.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'עברית · translation' })).toContainText('טיוטה');
  expect(readFileSync(join(project, 'he/index.md'), 'utf8')).toBe(translation);

  // Saving writes it and forgets the draft.
  await page.keyboard.press('Control+S');
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(readFileSync(join(project, 'he/index.md'), 'utf8')).toContain('טיוטה');
  await expect.poll(() => readdirSync(drafts).length).toBe(0);
});

test('saving over a file changed on disk asks; reload shows theirs, overwrite keeps mine', async () => {
  const project = await openCopyOfBasic();
  const file = join(project, 'he/index.md');
  await page.locator('nav').getByText('index', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'עברית · translation' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('שלי');

  // Another editor (or git) changes the file meanwhile.
  writeFileSync(file, '# שלהם\n');
  await page.keyboard.press('Control+S');
  const question = page.getByRole('alertdialog', { name: 'The translation changed on disk' });
  await expect(question).toBeVisible();
  expect(readFileSync(file, 'utf8')).toBe('# שלהם\n');

  await question.getByRole('button', { name: 'Reload from disk' }).click();
  await expect(question).toBeHidden();
  await expect(editor).toHaveText('# שלהם');
  await expect(page.getByRole('status')).toHaveText('');

  // Again, and this time keep mine.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ושלי');
  writeFileSync(file, '# שלהם שוב\n');
  await page.keyboard.press('Control+S');
  await question.getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(readFileSync(file, 'utf8')).toBe('# שלהם\n ושלי');

  expect(await problems.violations()).toEqual([]);
  expect(problems.console).toEqual([]);
});

test('shows links as text and a chip away from the caret, and edits them in a dialog', async () => {
  const project = join(profile, 'basic');
  cpSync(basicFixture, project, { recursive: true, verbatimSymlinks: true });
  writeFileSync(
    join(project, 'he/index.md'),
    '# ברוכים הבאים\n\nראו את [המדריך](https://example.org) כאן.\n',
  );
  await stubFolderDialog(project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.locator('nav').getByText('index', { exact: true }).click();
  const target = page.getByRole('textbox', { name: 'עברית · translation' });
  const line = target.locator('.cm-line').nth(2);
  await expect(line).toHaveText('ראו את המדריך כאן.');

  // Right to left, the chip follows the link text: it sits on its left.
  const text = await target.locator('.cm-md-link-text').boundingBox();
  // (Role queries don't look inside a textbox, so the chip is found by its class.)
  const chip = target.locator('.cm-md-link-chip');
  await expect(chip).toHaveAttribute('aria-label', 'Link to \u2068https://example.org\u2069');
  const chipBox = await chip.boundingBox();
  expect(chipBox !== null && text !== null && chipBox.x + chipBox.width <= text.x + 1).toBe(true);

  // The caret in the link shows its Markdown for editing.
  await target.locator('.cm-md-link-text').click();
  await expect(line).toHaveText('ראו את [המדריך](https://example.org) כאן.');
  await page.keyboard.press('Control+Home');
  await expect(line).toHaveText('ראו את המדריך כאן.');

  // Clicking the chip edits the link in a dialog, the target in a left-to-right field.
  await chip.click();
  const dialog = page.getByRole('dialog', { name: 'Edit link' });
  const url = dialog.getByRole('textbox', { name: 'Link target (URL or path)' });
  await expect(url).toBeFocused();
  await expect(url).toHaveValue('https://example.org');
  await expect(dialog.getByRole('textbox', { name: 'Text' })).toHaveAttribute('dir', 'rtl');
  await url.fill('https://example.org/he');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(line).toHaveText('ראו את המדריך כאן.');
  await expect(chip).toHaveAttribute('aria-label', 'Link to \u2068https://example.org/he\u2069');
  // Back in the editor, where the caret was.
  await page.keyboard.type('א');
  await expect(target.locator('.cm-line').first()).toHaveText('א# ברוכים הבאים');

  // Ctrl+K at the caret adds a link.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+K');
  const add = page.getByRole('dialog', { name: 'Add link' });
  await expect(add.getByRole('textbox', { name: 'Text' })).toBeFocused();
  await page.keyboard.type('עוד');
  await add.getByRole('textbox', { name: 'Link target (URL or path)' }).fill('./more.md');
  await page.keyboard.press('Enter');
  await expect(add).toBeHidden();
  await page.keyboard.press('Control+Home');
  await expect(target.locator('.cm-line').last()).toHaveText('עוד');
  await expect(target.locator('.cm-md-link-chip')).toHaveCount(2);

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

test('has the app icon: the mark, at 512 px', async () => {
  const icon = await app.evaluate(({ app: electronApp, nativeImage }) => {
    const image = nativeImage.createFromPath(
      `${electronApp.getAppPath()}/assets/icons/paperl10n-512.png`,
    );
    return { empty: image.isEmpty(), size: image.getSize() };
  });
  expect(icon).toEqual({ empty: false, size: { width: 512, height: 512 } });
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
