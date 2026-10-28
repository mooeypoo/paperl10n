// SPDX-License-Identifier: GPL-3.0-or-later
// The browser UI harness's composition root: a testing aid, never a product target (ADR 0015).
// The same UI and the same app wiring as Electron, over in-memory copies of the plugin fixtures.
import type { PaperLionApi } from '#ipc-contract';
import { createAppApi } from '#app/create-app-api';
import { builtInPlugins } from '#app/plugins';
import { InMemoryProjectSessions } from '#adapters/workspace/in-memory-project-sessions';
import { mountApp } from '#ui/mount';
import type { App as VueApp } from 'vue';
import { cloningTransport } from './cloning-transport';
import { fixtureOpener, fixturePicker, type Fixtures } from './fixtures';

/**
 * Marks a page as the harness. The app build is checked for this string
 * (scripts/check-app-build.ts), so harness code can't slip into a release unnoticed.
 */
export const HARNESS_MARKER = 'paperl10n-ui-harness';

/** The hand-editable sample project (examples/sample-docs). */
export const DEFAULT_FIXTURE = 'examples/sample-docs';

/** The real app API over fixtures, behind a transport that behaves like IPC. */
export function createHarnessApi(fixtures: Fixtures, fixture: string): PaperLionApi {
  const api = createAppApi({
    folderPicker: fixturePicker(fixture),
    opener: fixtureOpener(fixtures),
    sessions: new InMemoryProjectSessions(() => crypto.randomUUID()),
    plugins: builtInPlugins,
    onUnexpected: (method, thrown) => {
      console.error(`Unexpected error in ${method}:`, thrown);
    },
  });
  if (!api.ok) throw new Error(`The built-in plugins are broken: ${JSON.stringify(api.error)}`);
  return cloningTransport(api.value);
}

/** Mounts the UI on the harness API. "Open folder…" always opens `fixture`. */
export function startHarness(
  element: Element,
  fixtures: Fixtures,
  options: { readonly fixture?: string; readonly document?: Document } = {},
): VueApp {
  const page = options.document ?? document;
  page.documentElement.setAttribute(`data-${HARNESS_MARKER}`, '');
  const api = createHarnessApi(fixtures, options.fixture ?? DEFAULT_FIXTURE);
  return mountApp(element, api, { document: page });
}
