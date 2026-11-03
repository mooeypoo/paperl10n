// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { componentList, serializeComponents, type LicenseReport } from './third-party-licenses.ts';

const report: LicenseReport = {
  MIT: [
    { name: 'vue', versions: ['3.5.44'], license: 'MIT', homepage: 'https://vuejs.org/' },
    { name: '@lezer/common', versions: ['1.5.3'], license: 'MIT' },
    { name: 'nanoid', versions: ['5.0.0', '3.3.20'], license: 'MIT' },
  ],
  'OFL-1.1': [
    {
      name: '@fontsource/ibm-plex-sans',
      versions: ['5.3.0'],
      license: 'OFL-1.1',
      homepage: 'https://fontsource.org/fonts/ibm-plex-sans',
    },
  ],
};

const cldr = {
  generated: '2026-11-03',
  sources: [{ name: 'plural rules', url: 'https://example.org/plurals', license: 'MIT' }],
};

describe('componentList', () => {
  it('lists every package version, Electron, and the data sources, by name', () => {
    expect(componentList(report, '45.0.0', [cldr])).toEqual([
      {
        name: '@fontsource/ibm-plex-sans',
        version: '5.3.0',
        license: 'OFL-1.1',
        homepage: 'https://fontsource.org/fonts/ibm-plex-sans',
      },
      { name: '@lezer/common', version: '1.5.3', license: 'MIT', homepage: null },
      {
        name: 'electron',
        version: '45.0.0',
        license: 'MIT',
        homepage: 'https://www.electronjs.org',
      },
      { name: 'nanoid', version: '3.3.20', license: 'MIT', homepage: null },
      { name: 'nanoid', version: '5.0.0', license: 'MIT', homepage: null },
      {
        name: 'plural rules',
        version: '2026-11-03',
        license: 'MIT',
        homepage: 'https://example.org/plurals',
      },
      { name: 'vue', version: '3.5.44', license: 'MIT', homepage: 'https://vuejs.org/' },
    ]);
  });

  it("leaves out Paper Lion's own packages", () => {
    const own: LicenseReport = {
      'GPL-3.0-or-later': [
        { name: '@paperl10n/format-x', versions: ['1.0.0'], license: 'GPL-3.0-or-later' },
      ],
    };
    expect(componentList(own, '45.0.0', []).map((entry) => entry.name)).toEqual(['electron']);
  });
});

describe('serializeComponents', () => {
  it('writes indented JSON ending in a newline', () => {
    expect(
      serializeComponents([{ name: 'vue', version: '3', license: 'MIT', homepage: null }]),
    ).toBe(
      '[\n  {\n    "name": "vue",\n    "version": "3",\n    "license": "MIT",\n    "homepage": null\n  }\n]\n',
    );
  });
});
