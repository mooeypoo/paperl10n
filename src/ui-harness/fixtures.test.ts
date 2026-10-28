// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { describeProjectFilesOpenerContract } from '#domain-testing/workspace';
import type { ProjectPath } from '#kernel/project-path';
import { fixtureFolder, fixtureOpener, fixturePicker, fixturesFrom } from './fixtures';

describe('fixturesFrom', () => {
  it('groups glob results into projects named <plugin>/<fixture>', () => {
    const fixtures = fixturesFrom({
      '../plugins/format-stub/fixtures/basic/paperl10n.config.json': '{}',
      '../plugins/format-stub/fixtures/basic/en/index.md': '# Hi',
      '../plugins/format-stub/fixtures/docs-root/docs/en/intro.md': '# Intro',
      '../plugins/catalog-banana/fixtures/basic/i18n/en.json': '{}',
    });
    expect(Object.fromEntries(fixtures)).toEqual({
      'format-stub/basic': { 'paperl10n.config.json': '{}', 'en/index.md': '# Hi' },
      'format-stub/docs-root': { 'docs/en/intro.md': '# Intro' },
      'catalog-banana/basic': { 'i18n/en.json': '{}' },
    });
  });

  it.each([
    ['a plugin source file', '../plugins/format-stub/format-stub.ts'],
    ['a file directly in fixtures/', '../plugins/format-stub/fixtures/README.md'],
    ['something outside plugins', '../ui/App.vue'],
  ])('ignores %s', (_description, path) => {
    expect(fixturesFrom({ [path]: 'x' }).size).toBe(0);
  });
});

describe('the fixture picker and opener', () => {
  const fixtures = fixturesFrom({ '../plugins/format-stub/fixtures/basic/en/index.md': '# Hi' });

  it('picks the fixture folder, and opens it as in-memory files named after the fixture', async () => {
    const folder = await fixturePicker('format-stub/basic').pick();
    expect(folder).toBe(fixtureFolder('format-stub/basic'));
    const opened = await fixtureOpener(fixtures).open(folder ?? '');
    if (!opened.ok) throw new Error('expected the fixture to open');
    expect(opened.value.name).toBe('basic');
    expect(await opened.value.files.readText('en/index.md' as ProjectPath)).toEqual({
      ok: true,
      value: '# Hi',
    });
  });

  it.each([
    ['an unknown fixture', fixtureFolder('format-stub/nope')],
    ['a folder outside /fixtures/', '/home/user/project'],
  ])('reports %s as not found', async (_description, folder) => {
    expect(await fixtureOpener(fixtures).open(folder)).toEqual({
      ok: false,
      error: { code: 'workspace.folder-unavailable', reason: 'not-found' },
    });
  });
});

describeProjectFilesOpenerContract('fixtureOpener (UI harness)', (tree, folderName) =>
  Promise.resolve({
    opener: fixtureOpener(new Map([[`format-stub/${folderName}`, tree]])),
    folder: fixtureFolder(`format-stub/${folderName}`),
    missing: fixtureFolder('format-stub/nope'),
  }),
);
