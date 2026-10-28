// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId, type ProjectFiles, type SourceDocument } from '#plugin-api';
import { describePluginContract, InMemoryProjectFiles, openFixture } from '#plugin-api/testing';
import { formatStub } from './format-stub.ts';
import { plugin } from './index.ts';

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

function locale(raw: string): LocaleId {
  const id = localeId(raw);
  if (!id.ok) throw new Error(`test setup: ${raw}`);
  return id.value;
}

describePluginContract(plugin, {
  folder: new URL('.', import.meta.url).pathname,
  fixtures: [
    {
      name: 'basic',
      root: fixture('basic'),
      sourceLocale: 'en',
      targetLocales: ['he', 'pt-BR'],
      detected: true,
    },
    {
      name: 'docs-root',
      root: fixture('docs-root'),
      sourceLocale: 'en',
      targetLocales: ['fr'],
      options: { root: 'docs' },
      // Detection can't know the configured root, so a nested layout isn't recognized on its own.
      detected: false,
    },
  ],
});

async function open(name: string, options: Record<string, unknown> = {}, source = 'en') {
  const result = await formatStub.open({
    files: await openFixture(fixture(name)),
    sourceLocale: locale(source),
    options,
  });
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function listed(
  name: string,
  options: Record<string, unknown> = {},
): Promise<readonly SourceDocument[]> {
  const documents = await (await open(name, options)).listSourceDocuments();
  if (!documents.ok) throw new Error(`test setup: ${JSON.stringify(documents.error)}`);
  return documents.value;
}

describe('format-stub', () => {
  it('lists the source documents of the basic fixture, skipping non-Markdown and node_modules', async () => {
    expect(await listed('basic')).toEqual([
      { key: 'guide/getting-started', path: 'en/guide/getting-started.md', locale: 'en' },
      { key: 'index', path: 'en/index.md', locale: 'en' },
    ]);
  });

  it('maps a document to <locale>/<key>.md', async () => {
    const layout = await open('basic');
    const [gettingStarted] = await listed('basic');
    if (gettingStarted === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(gettingStarted, locale('he'))).toEqual({
      ok: true,
      value: 'he/guide/getting-started.md',
    });
  });

  it('honors the root option', async () => {
    expect(await listed('docs-root', { root: 'docs' })).toEqual([
      { key: 'intro', path: 'docs/en/intro.md', locale: 'en' },
    ]);
    const layout = await open('docs-root', { root: 'docs' });
    const [intro] = await listed('docs-root', { root: 'docs' });
    if (intro === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(intro, locale('fr'))).toEqual({
      ok: true,
      value: 'docs/fr/intro.md',
    });
  });

  it('lists the locale folders it finds, the source locale first', async () => {
    expect((await open('basic')).locales).toEqual([
      { locale: 'en', folder: 'en' },
      { locale: 'he', folder: 'he' },
    ]);
    expect((await open('docs-root', { root: 'docs' })).locales).toEqual([
      { locale: 'en', folder: 'docs/en' },
      { locale: 'fr', folder: 'docs/fr' },
    ]);
  });

  describe('detect', () => {
    it.each([
      [
        'basic',
        {
          matches: true,
          confidence: 'fallback',
          evidence: ['en/guide/getting-started.md', 'en/index.md', 'he/index.md'],
        },
      ],
      ['docs-root', { matches: false }],
      ['not-a-locale-layout', { matches: false }],
    ])('%s', async (name, expected) => {
      expect(await formatStub.detect(await openFixture(fixture(name)))).toEqual(expected);
    });

    it('caps evidence at three files', async () => {
      const files = new InMemoryProjectFiles({
        'en/a.md': '',
        'en/b.md': '',
        'en/c.md': '',
        'en/d.md': '',
      });
      const detection = await formatStub.detect(files);
      expect(detection.matches && detection.evidence).toEqual(['en/a.md', 'en/b.md', 'en/c.md']);
    });

    it('does not match when the project root cannot be listed', async () => {
      const unreadable: ProjectFiles = {
        list: (dir) =>
          Promise.resolve({ ok: false, error: { code: 'files.unreadable', path: dir } }),
        readText: (path) =>
          Promise.resolve({ ok: false, error: { code: 'files.unreadable', path } }),
        exists: () => Promise.resolve(true),
      };
      expect(await formatStub.detect(unreadable)).toEqual({ matches: false });
    });

    it('does not take long language-like folder names (guide, content) for locales', async () => {
      const files = new InMemoryProjectFiles({ 'guide/a.md': '', 'content/b.md': '' });
      expect(await formatStub.detect(files)).toEqual({ matches: false });
    });
  });

  describe('open errors', () => {
    it.each<[string, Record<string, unknown>, string, string]>([
      [
        'an unknown option',
        { colour: 'red' },
        'formats.invalid-options',
        'unknown option(s): colour',
      ],
      ['a non-string root', { root: 3 }, 'formats.invalid-options', '"root" must be a string'],
      [
        'a root escaping the project',
        { root: '../elsewhere' },
        'formats.invalid-options',
        '"root" must be a folder inside the project',
      ],
      [
        'a missing source folder',
        { root: 'nowhere' },
        'formats.unsupported-project',
        'no "nowhere/en" folder',
      ],
    ])('reports %s', async (_description, options, code, reason) => {
      const result = await formatStub.open({
        files: await openFixture(fixture('basic')),
        sourceLocale: locale('en'),
        options,
      });
      expect(result).toEqual({ ok: false, error: { code, reason } });
    });
  });

  describe('listing errors', () => {
    async function listIn(tree: Record<string, string>) {
      const opened = await formatStub.open({
        files: new InMemoryProjectFiles(tree),
        sourceLocale: locale('en'),
        options: {},
      });
      if (!opened.ok) throw new Error(`test setup: ${JSON.stringify(opened.error)}`);
      return opened.value.listSourceDocuments();
    }

    it('reports a source "folder" that is a file as formats.file-access', async () => {
      expect(await listIn({ en: 'a file, not a folder' })).toEqual({
        ok: false,
        error: {
          code: 'formats.file-access',
          cause: { code: 'files.not-a-directory', path: 'en' },
        },
      });
    });

    it('reports a file without a usable key', async () => {
      expect(await listIn({ 'en/.md': '' })).toEqual({
        ok: false,
        error: { code: 'formats.unsupported-project', reason: 'bad file name: en/.md' },
      });
    });
  });
});
