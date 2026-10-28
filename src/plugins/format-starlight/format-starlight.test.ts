// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId, type SourceDocument } from '#plugin-api';
import { describePluginContract, InMemoryProjectFiles, openFixture } from '#plugin-api/testing';
import { formatStarlight } from './format-starlight.ts';
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
      name: 'folder-locales',
      root: fixture('folder-locales'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'plain-astro',
      root: fixture('plain-astro'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      detected: true,
    },
    {
      name: 'named-folders',
      root: fixture('named-folders'),
      sourceLocale: 'en',
      targetLocales: ['he', 'zh-CN'],
      detected: true,
    },
    {
      name: 'cased-folders',
      root: fixture('cased-folders'),
      sourceLocale: 'en',
      targetLocales: ['zh-CN', 'pt-BR', 'he'],
      detected: true,
    },
    {
      name: 'not-starlight',
      root: fixture('not-starlight'),
      sourceLocale: 'en',
      targetLocales: ['he'],
      options: { contentDir: 'docs' },
      detected: false,
    },
  ],
});

async function layoutOf(name: string, options: Record<string, unknown> = {}, source = 'en') {
  const result = await formatStarlight.open({
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

describe('format-starlight detection', () => {
  it.each([
    [
      'an Astro config that uses Starlight',
      'root-locale',
      { matches: true, confidence: 'certain', evidence: ['astro.config.mjs', 'src/content/docs'] },
    ],
    [
      'an Astro config without Starlight',
      'plain-astro',
      { matches: true, confidence: 'likely', evidence: ['astro.config.mjs', 'src/content/docs'] },
    ],
    ['no Astro site', 'not-starlight', { matches: false }],
  ])('recognizes %s', async (_description, name, expected) => {
    expect(await formatStarlight.detect(await openFixture(fixture(name)))).toEqual(expected);
  });

  it('needs the content folder, not just a config', async () => {
    const files = new InMemoryProjectFiles({
      'astro.config.mjs': "import starlight from '@astrojs/starlight';",
    });
    expect(await formatStarlight.detect(files)).toEqual({ matches: false });
  });
});

describe('format-starlight with the source locale at the root', () => {
  it('lists root pages (.md and .mdx), but not other locales’ folders', async () => {
    expect(keysAndPaths(await listed('root-locale'))).toEqual([
      ['guides/getting-started', 'src/content/docs/guides/getting-started.md'],
      ['index', 'src/content/docs/index.mdx'],
      ['reference/api', 'src/content/docs/reference/api.md'],
    ]);
  });

  it('puts translations in lowercase locale folders, with the source’s extension', async () => {
    const layout = await layoutOf('root-locale');
    const [getting, index] = await listed('root-locale');
    if (getting === undefined || index === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(getting, locale('he'))).toEqual({
      ok: true,
      value: 'src/content/docs/he/guides/getting-started.md',
    });
    expect(layout.targetPathFor(index, locale('pt-BR'))).toEqual({
      ok: true,
      value: 'src/content/docs/pt-br/index.mdx',
    });
    expect(layout.targetPathFor(index, locale('en'))).toEqual({
      ok: true,
      value: 'src/content/docs/index.mdx',
    });
  });

  it('with localeFolders, excludes only the declared folders and uses their names', async () => {
    const options = { localeFolders: { en: '', he: 'hebrew' } };
    expect((await listed('root-locale', options)).map((d) => d.key)).toEqual([
      'guides/getting-started',
      'he/guides/getting-started',
      'he/index',
      'index',
      'pt-br/index',
      'reference/api',
    ]);
    const layout = await layoutOf('root-locale', options);
    const index = (await listed('root-locale', options)).find((d) => d.key === 'index');
    if (index === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(index, locale('he'))).toEqual({
      ok: true,
      value: 'src/content/docs/hebrew/index.mdx',
    });
    expect(layout.locales).toEqual([
      { locale: 'en', folder: 'src/content/docs' },
      { locale: 'he', folder: 'src/content/docs/hebrew' },
    ]);
  });

  it('refuses a target that would share the source locale’s folder', async () => {
    const layout = await layoutOf('root-locale', { localeFolders: { en: '', he: '' } });
    const [first] = await layout.listSourceDocuments().then((r) => (r.ok ? r.value : []));
    if (first === undefined) throw new Error('test setup');
    expect(layout.targetPathFor(first, locale('he'))).toEqual({
      ok: false,
      error: {
        code: 'formats.unsupported-project',
        reason: '"he" would share the "root" folder with the source locale',
      },
    });
  });
});

describe('format-starlight with the source locale in its own folder', () => {
  it('lists the source folder only, and maps to sibling locale folders', async () => {
    const documents = await listed('folder-locales');
    expect(keysAndPaths(documents)).toEqual([
      ['guides/intro', 'src/content/docs/en/guides/intro.mdx'],
      ['index', 'src/content/docs/en/index.md'],
    ]);
    const layout = await layoutOf('folder-locales');
    expect(documents.map((d) => layout.targetPathFor(d, locale('he')))).toEqual([
      { ok: true, value: 'src/content/docs/he/guides/intro.mdx' },
      { ok: true, value: 'src/content/docs/he/index.md' },
    ]);
  });
});

describe('format-starlight options', () => {
  it('reads pages from a custom content folder', async () => {
    expect(keysAndPaths(await listed('not-starlight', { contentDir: 'docs' }))).toEqual([
      ['index', 'docs/index.md'],
    ]);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['an unknown option', { root: 'docs' }, 'unknown option(s): root'],
    ['a non-string contentDir', { contentDir: 3 }, '"contentDir" must be a string'],
    [
      'a contentDir outside the project',
      { contentDir: '../elsewhere' },
      '"contentDir" must be a folder inside the project',
    ],
    [
      'localeFolders that is a list',
      { localeFolders: ['he'] },
      '"localeFolders" must map locale ids to folder names, for example { "en": "", "he": "he" }',
    ],
    [
      'a nested locale folder',
      { localeFolders: { he: 'a/b' } },
      '"localeFolders" needs locale ids mapped to "" (the root) or a folder name: he',
    ],
    [
      'a parent locale folder',
      { localeFolders: { he: '..' } },
      '"localeFolders" needs locale ids mapped to "" (the root) or a folder name: he',
    ],
    [
      'a non-string locale folder',
      { localeFolders: { he: 1 } },
      '"localeFolders" needs locale ids mapped to "" (the root) or a folder name: he',
    ],
  ])('rejects %s', async (_description, options, reason) => {
    const result = await formatStarlight.open({
      files: await openFixture(fixture('root-locale')),
      sourceLocale: locale('en'),
      options,
    });
    expect(result).toEqual({ ok: false, error: { code: 'formats.invalid-options', reason } });
  });

  it('says so when the content folder is missing', async () => {
    const result = await formatStarlight.open({
      files: new InMemoryProjectFiles({ 'a.md': '' }),
      sourceLocale: locale('en'),
      options: {},
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'no "src/content/docs" folder' },
    });
  });
});

describe("format-starlight's locale folders", () => {
  const targetOf = async (name: string, key: string, target: string, options = {}) => {
    const layout = await layoutOf(name, options);
    const document = (await listed(name, options)).find((d) => d.key === key);
    if (document === undefined) throw new Error(`test setup: no ${key}`);
    return layout.targetPathFor(document, locale(target));
  };

  it('reads them from the Astro config: named folders, and lang that differs from the key', async () => {
    expect((await layoutOf('named-folders')).locales).toEqual([
      { locale: 'en', folder: 'src/content/docs' },
      { locale: 'he', folder: 'src/content/docs/hebrew' },
      { locale: 'zh-CN', folder: 'src/content/docs/zh-cn' },
    ]);
    expect(await targetOf('named-folders', 'index', 'he')).toEqual({
      ok: true,
      value: 'src/content/docs/hebrew/index.md',
    });
    expect(await targetOf('named-folders', 'index', 'zh-CN')).toEqual({
      ok: true,
      value: 'src/content/docs/zh-cn/index.md',
    });
  });

  it('trusts the config over the two-letter heuristic: ui/ is pages, hebrew/ is a locale', async () => {
    expect((await listed('named-folders')).map((d) => d.key)).toEqual(['index', 'ui/buttons']);
  });

  it('falls back to existing folders, matching case-insensitively, when the config is dynamic', async () => {
    expect((await layoutOf('cased-folders')).locales).toEqual([
      { locale: 'en', folder: 'src/content/docs/en' },
      { locale: 'pt-BR', folder: 'src/content/docs/pt-br' },
      { locale: 'zh-CN', folder: 'src/content/docs/zh-CN' },
    ]);
    expect(await targetOf('cased-folders', 'index', 'zh-CN')).toEqual({
      ok: true,
      value: 'src/content/docs/zh-CN/index.md',
    });
    expect(await targetOf('cased-folders', 'index', 'pt-BR')).toEqual({
      ok: true,
      value: 'src/content/docs/pt-br/index.md',
    });
    // A locale with no folder yet: the lowercase convention.
    expect(await targetOf('cased-folders', 'index', 'he')).toEqual({
      ok: true,
      value: 'src/content/docs/he/index.md',
    });
  });

  it('lets localeFolders override the Astro config', async () => {
    expect(
      await targetOf('named-folders', 'index', 'he', { localeFolders: { en: '', he: 'he-IL' } }),
    ).toEqual({
      ok: true,
      value: 'src/content/docs/he-IL/index.md',
    });
  });

  it('rejects localeFolders keys that are not locale ids', async () => {
    const result = await formatStarlight.open({
      files: await openFixture(fixture('root-locale')),
      sourceLocale: locale('en'),
      options: { localeFolders: { 'not a locale': 'x' } },
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'formats.invalid-options',
        reason:
          '"localeFolders" needs locale ids mapped to "" (the root) or a folder name: not a locale',
      },
    });
  });
});
