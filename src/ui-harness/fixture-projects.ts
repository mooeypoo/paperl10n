// SPDX-License-Identifier: GPL-3.0-or-later
// The projects the harness can open, bundled into the page as text: every built-in plugin's
// fixtures (`<plugin>/<fixture>`) and the hand-editable sample projects in examples/
// (`examples/<name>`).
import { fixturesFrom, type Fixtures } from './fixtures';

export const fixtureProjects: Fixtures = fixturesFrom({
  ...import.meta.glob<string>('../plugins/*/fixtures/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>('../../examples/*/**/*', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
});
