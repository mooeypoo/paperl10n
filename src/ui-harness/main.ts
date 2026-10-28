// SPDX-License-Identifier: GPL-3.0-or-later
// The harness page's entry point (`pnpm dev:harness`). Pick a project with ?fixture=<plugin>/<fixture>
// or ?fixture=examples/<name>; the default is examples/sample-docs.
import { DEFAULT_FIXTURE, startHarness } from './harness';
import { fixtureProjects } from './fixture-projects';

const root = document.getElementById('app');
const fixture = new URLSearchParams(location.search).get('fixture') ?? DEFAULT_FIXTURE;
if (root !== null) startHarness(root, fixtureProjects, { fixture });
