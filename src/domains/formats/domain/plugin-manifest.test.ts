// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parsePluginManifest } from './plugin-manifest.ts';

const valid = {
  manifestVersion: 1,
  id: 'format-stub',
  packageName: '@paperl10n/format-stub',
  kind: 'document',
  apiVersion: 1,
  version: '0.1.0',
  displayName: 'Folder per locale (stub)',
  description: 'Reference plugin.',
  license: 'GPL-3.0-or-later',
  author: { name: 'Moriel', url: 'https://moriel.tech' },
  builtIn: true,
  capabilities: [],
  externalDependencies: [],
};

function problemFields(input: unknown): string[] {
  const result = parsePluginManifest(input);
  return result.ok ? [] : result.error.problems.map((p) => p.field);
}

describe('parsePluginManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parsePluginManifest(valid)).toEqual({ ok: true, value: valid });
  });

  it('drops unknown fields instead of passing them through', () => {
    const result = parsePluginManifest({ ...valid, futureField: 'x', __proto__evil: 1 });
    expect(result).toEqual({ ok: true, value: valid });
  });

  it('accepts a third-party plugin with its own package name and an author without url', () => {
    const thirdParty = {
      ...valid,
      packageName: '@someone/paperl10n-format-stub',
      builtIn: false,
      author: { name: 'Someone' },
      externalDependencies: ['yaml', '@scope/pkg'],
    };
    expect(parsePluginManifest(thirdParty)).toEqual({ ok: true, value: thirdParty });
  });

  it.each([['a string'], [null], [[]], [42]])('rejects a non-object manifest: %j', (input) => {
    expect(problemFields(input)).toEqual(['(manifest)']);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['missing manifestVersion', { manifestVersion: undefined }, 'manifestVersion'],
    ['unsupported manifestVersion', { manifestVersion: 2 }, 'manifestVersion'],
    ['bad id', { id: 'VitePress' }, 'id'],
    ['missing id', { id: undefined }, 'id'],
    ['unknown kind', { kind: 'theme' }, 'kind'],
    ['kind not matching the id prefix', { kind: 'catalog' }, 'kind'],
    ['unsupported apiVersion', { apiVersion: 2 }, 'apiVersion'],
    ['non-semver version', { version: '1.0' }, 'version'],
    ['empty displayName', { displayName: '  ' }, 'displayName'],
    ['missing description', { description: undefined }, 'description'],
    ['missing license', { license: '' }, 'license'],
    ['non-boolean builtIn', { builtIn: 'yes' }, 'builtIn'],
    ['invalid packageName', { packageName: 'Not A Name' }, 'packageName'],
    ['built-in with a foreign packageName', { packageName: '@someone/format-stub' }, 'packageName'],
    ['author without a name', { author: { url: 'https://x.dev' } }, 'author'],
    ['author url not http(s)', { author: { name: 'M', url: 'javascript:alert(1)' } }, 'author.url'],
    ['capabilities not an array', { capabilities: 'layout' }, 'capabilities'],
    ['a capability unknown to API v1', { capabilities: ['frontmatter-rules'] }, 'capabilities'],
    ['externalDependencies not an array', { externalDependencies: {} }, 'externalDependencies'],
    ['an invalid dependency name', { externalDependencies: ['Bad Name'] }, 'externalDependencies'],
    ['a duplicate dependency', { externalDependencies: ['yaml', 'yaml'] }, 'externalDependencies'],
  ])('reports %s', (_description, patch, field) => {
    expect(problemFields({ ...valid, ...patch })).toEqual([field]);
  });

  it('reports every problem at once, and the id when it was readable', () => {
    const result = parsePluginManifest({ ...valid, version: 'x', license: '', apiVersion: 9 });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'formats.manifest-invalid',
        pluginId: 'format-stub',
        problems: [
          { field: 'apiVersion', problem: 'must be one of: 1' },
          { field: 'version', problem: 'must be a semantic version like "1.2.3"' },
          { field: 'license', problem: 'must be an SPDX license expression' },
        ],
      },
    });
  });

  it('omits pluginId when the id is missing', () => {
    const result = parsePluginManifest({ ...valid, id: undefined });
    expect(!result.ok && 'pluginId' in result.error).toBe(false);
  });
});
