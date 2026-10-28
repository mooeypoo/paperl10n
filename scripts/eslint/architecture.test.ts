// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { pluginPolicies, readPluginDependencies } from './architecture.ts';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe('readPluginDependencies', () => {
  it('reads externalDependencies from each plugin manifest, tolerating missing or malformed ones', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paperl10n-plugins-'));
    roots.push(root);
    const write = async (plugin: string, manifest?: string) => {
      await mkdir(join(root, plugin));
      if (manifest !== undefined)
        await writeFile(join(root, plugin, 'paperl10n-plugin.json'), manifest);
    };
    await write('format-a', JSON.stringify({ externalDependencies: ['yaml', 7, '@scope/pkg'] }));
    await write('format-b', JSON.stringify({ externalDependencies: 'yaml' }));
    await write('format-c', JSON.stringify({ id: 'format-c' }));
    await write('format-d');
    await writeFile(join(root, 'not-a-folder.txt'), '');

    const found = readPluginDependencies(pathToFileURL(`${root}/`));
    expect([...found].sort((a, b) => a.plugin.localeCompare(b.plugin))).toEqual([
      { plugin: 'format-a', externalDependencies: ['yaml', '@scope/pkg'] },
      { plugin: 'format-b', externalDependencies: [] },
      { plugin: 'format-c', externalDependencies: [] },
      { plugin: 'format-d', externalDependencies: [] },
    ]);
  });

  it('returns nothing when there is no plugins folder', () => {
    expect(readPluginDependencies(pathToFileURL('/definitely/not/here/'))).toEqual([]);
  });
});

describe('pluginPolicies', () => {
  it('allows exactly the declared packages, for the plugin and its tests', () => {
    const [main, tests] = pluginPolicies({ plugin: 'format-a', externalDependencies: ['yaml'] });
    expect(JSON.stringify(main)).toContain('"source":"yaml"');
    expect(JSON.stringify(tests)).toContain('"source":"yaml"');
    expect(JSON.stringify(tests)).toContain('"source":"vitest"');
    expect(JSON.stringify(main)).not.toContain('vitest');
  });
});
