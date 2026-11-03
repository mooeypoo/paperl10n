// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseComponents, readAboutFiles } from './about-files.ts';

const vue = { name: 'vue', version: '3.5.44', license: 'MIT', homepage: 'https://vuejs.org' };

async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = join(tmpdir(), `paperl10n-about-${randomUUID()}`);
  await mkdir(folder, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(folder, name), text);
  return folder;
}

describe('readAboutFiles', () => {
  it('reads the licence and the components list', async () => {
    const folder = await folderWith({
      LICENSE: 'GNU GENERAL PUBLIC LICENSE\n',
      'third-party-licenses.json': JSON.stringify([vue]),
    });
    expect(
      await readAboutFiles({
        name: 'Paper Lion',
        version: '0.1.0',
        licenseFile: join(folder, 'LICENSE'),
        componentsFile: join(folder, 'third-party-licenses.json'),
      }),
    ).toEqual({
      name: 'Paper Lion',
      version: '0.1.0',
      licenseText: 'GNU GENERAL PUBLIC LICENSE\n',
      components: [vue],
    });
  });

  it('still answers when the files are missing', async () => {
    const folder = await folderWith({});
    expect(
      await readAboutFiles({
        name: 'Paper Lion',
        version: '0.1.0',
        licenseFile: join(folder, 'LICENSE'),
        componentsFile: join(folder, 'third-party-licenses.json'),
      }),
    ).toEqual({ name: 'Paper Lion', version: '0.1.0', licenseText: '', components: [] });
  });
});

describe('parseComponents', () => {
  it.each([
    ['a list', JSON.stringify([vue]), [vue]],
    ['no homepage', JSON.stringify([{ ...vue, homepage: null }]), [{ ...vue, homepage: null }]],
    ['not JSON', '{', []],
    ['not a list', JSON.stringify({ vue }), []],
    ['an entry without a licence', JSON.stringify([{ ...vue, license: undefined }, vue]), [vue]],
    ['a version that is a number', JSON.stringify([{ ...vue, version: 3 }]), []],
    ['a homepage that is a number', JSON.stringify([{ ...vue, homepage: 1 }]), []],
    ['a null entry', JSON.stringify([null, vue]), [vue]],
    ['extra fields', JSON.stringify([{ ...vue, paths: ['/x'] }]), [vue]],
  ])('%s', (_description, text, expected) => {
    expect(parseComponents(text)).toEqual(expected);
  });
});
