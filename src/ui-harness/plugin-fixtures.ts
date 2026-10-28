// SPDX-License-Identifier: GPL-3.0-or-later
// Every built-in plugin's fixture projects, bundled into the harness page as text.
import { fixturesFrom, type Fixtures } from './fixtures';

export const pluginFixtures: Fixtures = fixturesFrom(
  import.meta.glob<string>('../plugins/*/fixtures/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
