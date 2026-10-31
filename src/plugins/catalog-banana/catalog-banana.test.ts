// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  catalogKey,
  localeId,
  PROJECT_ROOT,
  projectPath,
  type CatalogLayout,
  type LocaleId,
  type ProjectFiles,
  type SourceCatalog,
} from '#plugin-api';
import { describePluginContract, InMemoryProjectFiles, openFixture } from '#plugin-api/testing';
import { catalogBanana } from './catalog-banana.ts';
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
      name: 'mediawiki-extension',
      root: fixture('mediawiki-extension'),
      sourceLocale: 'en',
      targetLocales: ['he', 'pt-BR', 'fr', 'zh-Hans'],
      detected: true,
    },
    {
      name: 'jquery-app',
      root: fixture('jquery-app'),
      sourceLocale: 'en',
      targetLocales: ['fr', 'he', 'pt-BR'],
      detected: true,
    },
    {
      name: 'paperl10n-self',
      root: fixture('paperl10n-self'),
      sourceLocale: 'en',
      targetLocales: ['he', 'ar'],
      detected: true,
    },
    {
      name: 'pinned-dirs',
      root: fixture('pinned-dirs'),
      sourceLocale: 'en',
      targetLocales: ['fr', 'de'],
      options: { dirs: ['lang'] },
      // No @metadata and no qqq.json: only the option finds it.
      detected: false,
    },
    {
      name: 'not-banana',
      root: fixture('not-banana'),
      sourceLocale: 'en',
      targetLocales: ['fr'],
      detected: false,
    },
  ],
});

async function openWith(
  files: ProjectFiles,
  options: Record<string, unknown> = {},
  source = 'en',
): Promise<CatalogLayout> {
  const result = await catalogBanana.open({ files, sourceLocale: locale(source), options });
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function catalogsOf(layout: CatalogLayout): Promise<readonly SourceCatalog[]> {
  const catalogs = await layout.listCatalogs();
  if (!catalogs.ok) throw new Error(`test setup: ${JSON.stringify(catalogs.error)}`);
  return catalogs.value;
}

function pathFor(layout: CatalogLayout, catalog: SourceCatalog | undefined, target: string) {
  if (catalog === undefined) throw new Error('test setup: no catalog');
  const path = layout.targetPathFor(catalog, locale(target));
  return path.ok ? path.value : path.error.code;
}

const banana = '{\n\t"@metadata": {},\n\t"m": "M"\n}\n';

describe('catalog-banana: detection', () => {
  it.each([
    [
      'a MediaWiki extension by its MessagesDirs',
      'mediawiki-extension',
      'certain',
      ['extension.json'],
    ],
    ['a jQuery.i18n app by its @metadata', 'jquery-app', 'likely', ['i18n/en.json']],
    [
      "Paper Lion's own messages by their qqq.json",
      'paperl10n-self',
      'likely',
      ['src/ui/i18n/messages/qqq.json'],
    ],
  ])('recognizes %s', async (_name, name, confidence, evidence) => {
    expect(await catalogBanana.detect(await openFixture(fixture(name)))).toEqual({
      matches: true,
      confidence,
      evidence,
    });
  });

  it.each(['pinned-dirs', 'not-banana'])('does not recognize %s', async (name) => {
    expect(await catalogBanana.detect(await openFixture(fixture(name)))).toEqual({
      matches: false,
    });
  });

  it('recognizes a skin by skin.json', async () => {
    const files = new InMemoryProjectFiles({
      'skin.json': '{"MessagesDirs": {"Skin": "i18n"}}',
      'i18n/en.json': banana,
    });
    expect(await catalogBanana.detect(files)).toEqual({
      matches: true,
      confidence: 'certain',
      evidence: ['skin.json'],
    });
  });

  it('falls back to scanning when the manifest is broken or lists no messages', async () => {
    for (const manifest of ['{ not json', '{"name": "x"}', '{"MessagesDirs": {"X": [1]}}']) {
      const files = new InMemoryProjectFiles({
        'extension.json': manifest,
        'i18n/qqq.json': '{}',
        'i18n/en.json': banana,
      });
      expect(await catalogBanana.detect(files)).toEqual({
        matches: true,
        confidence: 'likely',
        evidence: ['i18n/qqq.json'],
      });
    }
  });
});

describe('catalog-banana: the layout', () => {
  it("lists a MediaWiki extension's message folders, in its manifest's order", async () => {
    const layout = await openWith(await openFixture(fixture('mediawiki-extension')));
    expect(await catalogsOf(layout)).toEqual([
      { key: 'i18n', path: 'i18n/en.json', locale: 'en', documentation: 'i18n/qqq.json' },
      {
        key: 'i18n/api',
        path: 'i18n/api/en.json',
        locale: 'en',
        documentation: 'i18n/api/qqq.json',
      },
    ]);
    expect(layout.locales).toEqual(['en', 'he', 'pt-BR', 'de']);
  });

  it('maps locales to files named as MediaWiki names them, existing or not', async () => {
    const layout = await openWith(await openFixture(fixture('mediawiki-extension')));
    const [main, api] = await catalogsOf(layout);
    expect(pathFor(layout, main, 'en')).toBe('i18n/en.json');
    expect(pathFor(layout, main, 'pt-BR')).toBe('i18n/pt-br.json');
    expect(pathFor(layout, main, 'zh-Hans')).toBe('i18n/zh-hans.json');
    expect(pathFor(layout, api, 'de')).toBe('i18n/api/de.json');
    expect(pathFor(layout, api, 'he')).toBe('i18n/api/he.json');
  });

  it("keeps the case of a folder's file names when it has uppercase ones", async () => {
    const files = new InMemoryProjectFiles({ 'i18n/en.json': banana, 'i18n/pt-BR.json': banana });
    const layout = await openWith(files);
    const [catalog] = await catalogsOf(layout);
    expect(pathFor(layout, catalog, 'pt-BR')).toBe('i18n/pt-BR.json');
    expect(pathFor(layout, catalog, 'zh-Hans')).toBe('i18n/zh-Hans.json');
  });

  it('finds an existing file whatever its case', async () => {
    const files = new InMemoryProjectFiles({ 'i18n/EN.json': banana, 'i18n/qqq.json': '{}' });
    const layout = await openWith(files);
    expect(await catalogsOf(layout)).toEqual([
      { key: 'i18n', path: 'i18n/EN.json', locale: 'en', documentation: 'i18n/qqq.json' },
    ]);
  });

  it('scans for folders with the source locale and @metadata or qqq.json', async () => {
    const files = new InMemoryProjectFiles({
      'a/en.json': banana,
      'b/en.json': '{"m": "M"}',
      'b/qqq.json': '{}',
      'c/en.json': '{"m": "M"}',
      'd/fr.json': banana,
      'e/en.json': 'not json',
    });
    expect((await catalogsOf(await openWith(files))).map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('scans with the source locale it is given', async () => {
    const files = new InMemoryProjectFiles({ 'i18n/en.json': banana, 'i18n/he.json': banana });
    const layout = await openWith(files, {}, 'he');
    expect(await catalogsOf(layout)).toEqual([{ key: 'i18n', path: 'i18n/he.json', locale: 'he' }]);
    expect(layout.locales).toEqual(['he', 'en']);
  });

  it('keys a catalog at the project root as "."', async () => {
    const layout = await openWith(new InMemoryProjectFiles({ 'en.json': banana }));
    const [catalog] = await catalogsOf(layout);
    expect(catalog?.key).toBe('.');
    expect(pathFor(layout, catalog, 'he')).toBe('he.json');
  });

  it('reads MessagesDirs as a string or a list, normalized, and skips folders without the source', async () => {
    const files = new InMemoryProjectFiles({
      'extension.json': '{"MessagesDirs": {"A": "./i18n/", "B": ["i18n/none", "lang//"]}}',
      'i18n/en.json': banana,
      'i18n/none/fr.json': banana,
      'lang/en.json': '{"m": "M"}',
    });
    expect((await catalogsOf(await openWith(files))).map((c) => c.key)).toEqual(['i18n', 'lang']);
  });

  it('lists only the messages folders the dirs option names, ignoring the manifest', async () => {
    const files = new InMemoryProjectFiles({
      'extension.json': '{"MessagesDirs": {"A": "i18n"}}',
      'i18n/en.json': banana,
      'other/en.json': '{}',
    });
    const layout = await openWith(files, { dirs: ['./other/', 'other'] });
    expect((await catalogsOf(layout)).map((c) => c.key)).toEqual(['other']);
  });

  it('accepts the project root in the dirs option', async () => {
    const layout = await openWith(new InMemoryProjectFiles({ 'en.json': '{}' }), { dirs: ['.'] });
    expect((await catalogsOf(layout)).map((c) => c.key)).toEqual(['.']);
  });

  it("rejects a catalog that isn't one of its own", async () => {
    const layout = await openWith(new InMemoryProjectFiles({ 'i18n/en.json': banana }));
    const key = catalogKey('elsewhere');
    const path = projectPath('elsewhere/en.json');
    if (!key.ok || !path.ok) throw new Error('test setup');
    const stranger: SourceCatalog = { key: key.value, path: path.value, locale: locale('en') };
    expect(pathFor(layout, stranger, 'he')).toBe('formats.unsupported-project');
  });
});

describe('catalog-banana: errors', () => {
  const files = new InMemoryProjectFiles({ 'i18n/en.json': banana });
  const openError = async (options: Record<string, unknown>) => {
    const result = await catalogBanana.open({ files, sourceLocale: locale('en'), options });
    return result.ok ? 'ok' : result.error.code;
  };

  it.each<[string, Record<string, unknown>]>([
    ['an unknown option', { messagesDirs: ['i18n'] }],
    ['dirs that is not a list', { dirs: 'i18n' }],
    ['an empty dirs list', { dirs: [] }],
    ['a dirs entry that is not text', { dirs: [1] }],
    ['a dirs entry outside the project', { dirs: ['../i18n'] }],
  ])('rejects %s with formats.invalid-options', async (_name, options) => {
    expect(await openError(options)).toBe('formats.invalid-options');
  });

  it("reports a pinned folder without the source locale's file", async () => {
    expect(await openError({ dirs: ['lang'] })).toBe('formats.unsupported-project');
  });

  it('reports a project it cannot list', async () => {
    const unlistable: ProjectFiles = {
      list: () =>
        Promise.resolve({ ok: false, error: { code: 'files.unreadable', path: PROJECT_ROOT } }),
      readText: () =>
        Promise.resolve({ ok: false, error: { code: 'files.unreadable', path: PROJECT_ROOT } }),
      exists: () => Promise.resolve(false),
    };
    const result = await catalogBanana.open({
      files: unlistable,
      sourceLocale: locale('en'),
      options: {},
    });
    expect(result.ok ? 'ok' : result.error.code).toBe('formats.file-access');
    expect(await catalogBanana.detect(unlistable)).toEqual({ matches: false });
  });
});

describe("catalog-banana: Paper Lion's own messages", () => {
  it('reads every message of the app, with its documentation and Hebrew', async () => {
    const files = await openFixture(fixture('paperl10n-self'));
    const layout = await openWith(files);
    const [catalog] = await catalogsOf(layout);
    expect(catalog).toEqual({
      key: 'src/ui/i18n/messages',
      path: 'src/ui/i18n/messages/en.json',
      locale: 'en',
      documentation: 'src/ui/i18n/messages/qqq.json',
    });
    expect(layout.locales).toEqual(['en', 'he']);
    const text = await files.readText(catalog?.path ?? PROJECT_ROOT);
    const parsed = text.ok ? catalogBanana.parse(text.value) : undefined;
    expect(parsed?.ok && parsed.value.messages.length).toBeGreaterThan(100);
  });
});
