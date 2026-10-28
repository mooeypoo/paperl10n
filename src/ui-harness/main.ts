// SPDX-License-Identifier: GPL-3.0-or-later
// The harness page's entry point (`pnpm dev:harness`). Pick a fixture with ?fixture=<plugin>/<name>.
import { DEFAULT_FIXTURE, startHarness } from './harness';
import { pluginFixtures } from './plugin-fixtures';

const root = document.getElementById('app');
const fixture = new URLSearchParams(location.search).get('fixture') ?? DEFAULT_FIXTURE;
if (root !== null) startHarness(root, pluginFixtures, { fixture });
