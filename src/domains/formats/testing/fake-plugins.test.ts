// SPDX-License-Identifier: GPL-3.0-or-later
// The fake plugins are test support for other domains; they must themselves satisfy the registry
// and the plugin contract, or tests built on them would prove nothing. The fake catalog plugin is
// the well-behaved plugin of the kit's own tests (plugin-contract.test.ts).
import { describe, expect, it } from 'vitest';
import { localeId } from '#kernel/locale-id';
import { createFormatRegistry } from '../application/format-registry.ts';
import { detects, fakeDocumentPlugin } from './fake-plugins.ts';
import { InMemoryProjectFiles } from '../adapters/in-memory-project-files.ts';
import { documentFixtureChecks, type FixtureUnderTest } from './plugin-contract.ts';

const tree = { 'en/a.md': '', 'en/guide/b.md': '', 'he/a.md': '' };
const subject: FixtureUnderTest = {
  fixture: {
    name: 'tree',
    root: '(memory)',
    sourceLocale: 'en',
    targetLocales: ['he'],
    detected: false,
  },
  files: () => Promise.resolve(new InMemoryProjectFiles(tree)),
};

describe('fakeDocumentPlugin', () => {
  it('registers', () => {
    expect(createFormatRegistry([fakeDocumentPlugin('format-fake')], { apiVersion: 3 }).ok).toBe(
      true,
    );
  });

  it.each(Object.entries(documentFixtureChecks))(
    'passes the kit check: %s',
    async (_name, check) => {
      await check(fakeDocumentPlugin('format-fake'), subject);
    },
  );

  it('detects with the requested confidence', async () => {
    const files = new InMemoryProjectFiles(tree);
    const module = fakeDocumentPlugin('format-fake', detects('likely'));
    const format = module.create({ apiVersion: 3 });
    expect(await format.detect(files)).toEqual({
      matches: true,
      confidence: 'likely',
      evidence: [],
    });
  });

  it('reports an unlistable source folder', async () => {
    const format = fakeDocumentPlugin('format-fake').create({ apiVersion: 3 });
    if (format.kind !== 'document') throw new Error('test setup');
    const en = localeId('en');
    if (!en.ok) throw new Error('test setup');
    const layout = await format.open({
      files: new InMemoryProjectFiles({ en: 'file' }),
      sourceLocale: en.value,
      options: {},
    });
    expect(layout.ok && (await layout.value.listSourceDocuments()).ok).toBe(false);
  });
});
