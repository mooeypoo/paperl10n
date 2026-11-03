// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId, type SourceDocument } from '#plugin-api';
import { describePluginContract, InMemoryProjectFiles, openFixture } from '#plugin-api/testing';
import { formatVitepress } from './format-vitepress.ts';
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
      name: 'root-locale',
      root: fixture('root-locale'),
      sourceLocale: 'en',
      targetLocales: ['he', 'pt-BR'],
      detected: true,
    },
    {
      name: 'docs-site',
      root: fixture('docs-site'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'folder-locales',
      root: fixture('folder-locales'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'built-locales',
      root: fixture('built-locales'),
      sourceLocale: 'en',
      targetLocales: ['zh-CN', 'pt-BR', 'he'],
      detected: true,
    },
    {
      name: 'plain-config',
      root: fixture('plain-config'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'not-vitepress',
      root: fixture('not-vitepress'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      options: { siteDir: 'site' },
      detected: false,
    },
  ],
});

async function layoutOf(name: string, options: Record<string, unknown> = {}, source = 'en') {
  const result = await formatVitepress.open({
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
  const documents = await (await layoutOf(name, options)).listSourceDocuments();
  if (!documents.ok) throw new Error(`test setup: ${JSON.stringify(documents.error)}`);
  return documents.value;
}

const keysAndPaths = (documents: readonly SourceDocument[]) =>
  documents.map((d) => [d.key, d.path]);

async function targetPath(name: string, key: string, target: string, options = {}) {
  const layout = await layoutOf(name, options);
  const documents = await layout.listSourceDocuments();
  if (!documents.ok) throw new Error('test setup');
  const document = documents.value.find((d) => d.key === key);
  if (document === undefined) throw new Error(`test setup: no ${key}`);
  return layout.targetPathFor(document, locale(target));
}

const localesOf = async (name: string, options: Record<string, unknown> = {}) =>
  (await layoutOf(name, options)).locales.map((l) => [l.locale, l.folder]);

describe('format-vitepress detection', () => {
  it.each([
    [
      'a config that uses VitePress',
      'root-locale',
      { matches: true, confidence: 'certain', evidence: ['.vitepress/config.mts'] },
    ],
    [
      'a site in docs/',
      'docs-site',
      { matches: true, confidence: 'certain', evidence: ['docs/.vitepress/config.ts'] },
    ],
    [
      'a config that never names VitePress',
      'plain-config',
      { matches: true, confidence: 'likely', evidence: ['.vitepress/config.js'] },
    ],
    ['no VitePress config', 'not-vitepress', { matches: false }],
  ])('recognizes %s', async (_description, name, expected) => {
    expect(await formatVitepress.detect(await openFixture(fixture(name)))).toEqual(expected);
  });

  it.each([
    ['config/index.ts', '.vitepress/config/index.ts'],
    ['a .cjs config in website/', 'website/.vitepress/config.cjs'],
  ])('finds %s', async (_description, path) => {
    const files = new InMemoryProjectFiles({ [path]: "import { defineConfig } from 'vitepress'" });
    expect(await formatVitepress.detect(files)).toEqual({
      matches: true,
      confidence: 'certain',
      evidence: [path],
    });
  });

  it('prefers a site at the root to one in a folder, and ignores sites deeper down', async () => {
    const both = new InMemoryProjectFiles({
      'docs/.vitepress/config.ts': 'vitepress',
      '.vitepress/config.ts': 'vitepress',
    });
    expect(await formatVitepress.detect(both)).toMatchObject({
      evidence: ['.vitepress/config.ts'],
    });
    const deep = new InMemoryProjectFiles({ 'packages/docs/.vitepress/config.ts': 'vitepress' });
    expect(await formatVitepress.detect(deep)).toEqual({ matches: false });
  });
});

describe('format-vitepress with the source locale at the root', () => {
  it('lists root pages, but not other locales’ folders, public/, or dot-folders', async () => {
    expect(keysAndPaths(await listed('root-locale'))).toEqual([
      ['guide/getting-started', 'guide/getting-started.md'],
      ['index', 'index.md'],
      ['reference/api', 'reference/api.md'],
    ]);
  });

  it('reads the locales from the site’s config, not from its search options', async () => {
    expect(await localesOf('root-locale')).toEqual([
      ['en', ''],
      ['he', 'he'],
      ['pt-BR', 'pt-br'],
    ]);
  });

  it.each([
    ['he', 'he/guide/getting-started.md'],
    ['pt-BR', 'pt-br/guide/getting-started.md'],
    ['fr', 'fr/guide/getting-started.md'],
  ])('puts the %s translation in its folder', async (target, expected) => {
    expect(await targetPath('root-locale', 'guide/getting-started', target)).toEqual({
      ok: true,
      value: expected,
    });
  });

  it.each([
    ['/he/guide/getting-started', '/guide/getting-started'],
    ['/he/reference/api.md', '/reference/api.md'],
    ['/he/', '/'],
    ['/HE/guide.html', '/guide.html'],
    ['/hello/world', '/hello/world'],
    ['./guide/getting-started.md', './guide/getting-started.md'],
    ['https://example.org/he/', 'https://example.org/he/'],
  ])('reads the Hebrew link %s as the source writes it', async (target, expected) => {
    const layout = await layoutOf('root-locale');
    expect(layout.sourceLinkTarget?.(target, locale('he'))).toBe(expected);
    expect(layout.sourceLinkTarget?.(target, locale('en'))).toBe(target);
  });
});

describe('format-vitepress with a site in a folder', () => {
  it('lists the pages under srcDir, with paths from the project root', async () => {
    expect(keysAndPaths(await listed('docs-site'))).toEqual([
      ['guide/intro', 'docs/src/guide/intro.md'],
      ['index', 'docs/src/index.md'],
    ]);
    expect(await targetPath('docs-site', 'guide/intro', 'he')).toEqual({
      ok: true,
      value: 'docs/src/he/guide/intro.md',
    });
  });

  it('takes every locale key as a folder, even when its entry is built with a spread', async () => {
    // `root: { label, ...en }` and `he: { label, ...he }`: no lang to read, so he's is its key.
    expect(await localesOf('docs-site')).toEqual([
      ['en', 'docs/src'],
      ['he', 'docs/src/he'],
    ]);
  });

  it('still reads the config when siteDir is given', async () => {
    expect(keysAndPaths(await listed('docs-site', { siteDir: 'docs' }))).toEqual([
      ['guide/intro', 'docs/src/guide/intro.md'],
      ['index', 'docs/src/index.md'],
    ]);
  });

  it('takes srcDir and siteDir from the options', async () => {
    expect(keysAndPaths(await listed('docs-site', { srcDir: 'src/guide' }))).toEqual([
      ['intro', 'docs/src/guide/intro.md'],
    ]);
    expect(keysAndPaths(await listed('not-vitepress', { siteDir: 'site' }))).toEqual([
      ['index', 'site/index.md'],
    ]);
  });
});

describe('format-vitepress with each locale in its own folder', () => {
  it('lists the source locale’s folder only', async () => {
    expect(keysAndPaths(await listed('folder-locales'))).toEqual([
      ['guide/setup', 'en/guide/setup.md'],
      ['index', 'en/index.md'],
    ]);
    expect(await targetPath('folder-locales', 'guide/setup', 'he')).toEqual({
      ok: true,
      value: 'he/guide/setup.md',
    });
  });

  it('maps a link between the locale folders', async () => {
    const layout = await layoutOf('folder-locales');
    expect(layout.sourceLinkTarget?.('/he/guide/setup', locale('he'))).toBe('/en/guide/setup');
  });
});

describe('format-vitepress with locales built in code', () => {
  it('falls back to folders named like locales, found ignoring case', async () => {
    expect(keysAndPaths(await listed('built-locales'))).toEqual([
      ['api/index', 'api/index.md'],
      ['index', 'index.md'],
    ]);
    expect(await localesOf('built-locales')).toEqual([
      ['en', ''],
      ['pt-BR', 'pt-br'],
      ['zh-CN', 'zh-CN'],
    ]);
    expect(await targetPath('built-locales', 'index', 'zh-CN')).toEqual({
      ok: true,
      value: 'zh-CN/index.md',
    });
  });

  it('falls back the same way when a spread is among the locale keys', async () => {
    const result = await formatVitepress.open({
      files: new InMemoryProjectFiles({
        '.vitepress/config.ts': `export default { locales: { ...shared, hebrew: { lang: 'he' } } }`,
        'index.md': '# Home',
        'hebrew/index.md': '# בית',
        'pt-br/index.md': '# Início',
      }),
      sourceLocale: locale('en'),
      options: {},
    });
    if (!result.ok) throw new Error('test setup');
    // Not "hebrew" for he: the locales can't all be read, so none are taken from the config.
    expect(result.value.locales.map((l) => [l.locale, l.folder])).toEqual([
      ['en', ''],
      ['pt-BR', 'pt-br'],
    ]);
  });

  it('uses localeFolders from the options over everything else', async () => {
    const options = { localeFolders: { en: '', he: 'hebrew', 'pt-BR': 'pt-br' } };
    expect(await localesOf('built-locales', options)).toEqual([
      ['en', ''],
      ['he', 'hebrew'],
      ['pt-BR', 'pt-br'],
    ]);
    // Only declared folders are other locales': zh-CN/ is now a source folder.
    expect(keysAndPaths(await listed('built-locales', options))).toContainEqual([
      'zh-CN/index',
      'zh-CN/index.md',
    ]);
  });
});

describe('format-vitepress options and errors', () => {
  it.each([
    [{ base: '/docs/' }, 'unknown option(s): base'],
    [{ siteDir: 3 }, '"siteDir" must be a folder inside the project'],
    [{ siteDir: '../elsewhere' }, '"siteDir" must be a folder inside the project'],
    [{ srcDir: '../src' }, '"srcDir" must be a folder inside the site'],
    [{ srcDir: false }, '"srcDir" must be a folder inside the site'],
    [{ localeFolders: ['he'] }, '"localeFolders" must map locale ids to folder names'],
    [{ localeFolders: { he: 'a/b' } }, 'a folder name: he'],
    [{ localeFolders: { 'not a locale': 'x' } }, 'a folder name: not a locale'],
  ])('refuses %j', async (options, reason) => {
    const result = await formatVitepress.open({
      files: await openFixture(fixture('root-locale')),
      sourceLocale: locale('en'),
      options,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'formats.invalid-options' } });
    if (!result.ok && result.error.code === 'formats.invalid-options') {
      expect(result.error.reason).toContain(reason);
    }
  });

  it('refuses a project without a config, or a source folder that isn’t there', async () => {
    const files = await openFixture(fixture('not-vitepress'));
    expect(
      await formatVitepress.open({ files, sourceLocale: locale('en'), options: {} }),
    ).toMatchObject({ ok: false, error: { code: 'formats.unsupported-project' } });
    expect(
      await formatVitepress.open({
        files,
        sourceLocale: locale('en'),
        options: { siteDir: 'site', srcDir: 'missing' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'formats.unsupported-project' } });
  });

  it('refuses a target that would share the source locale’s folder', async () => {
    const options = { localeFolders: { en: '', he: '' } };
    expect(await targetPath('root-locale', 'index', 'he', options)).toMatchObject({
      ok: false,
      error: { code: 'formats.unsupported-project' },
    });
  });

  it('reads a srcDir written as "src/", and ignores one built in code', async () => {
    const pages = { 'src/index.md': '# Home', 'index.md': '# Root' };
    const open = (config: string) =>
      formatVitepress.open({
        files: new InMemoryProjectFiles({ '.vitepress/config.ts': config, ...pages }),
        sourceLocale: locale('en'),
        options: {},
      });
    const keys = async (config: string) => {
      const layout = await open(config);
      if (!layout.ok) throw new Error('test setup');
      const documents = await layout.value.listSourceDocuments();
      return documents.ok ? keysAndPaths(documents.value) : documents;
    };
    expect(await keys(`export default { srcDir: 'src/' }`)).toEqual([['index', 'src/index.md']]);
    expect(await keys(`export default { srcDir: process.env.SRC }`)).toEqual([
      ['index', 'index.md'],
      ['src/index', 'src/index.md'],
    ]);
  });
});
