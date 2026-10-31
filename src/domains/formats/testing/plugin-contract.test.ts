// SPDX-License-Identifier: GPL-3.0-or-later
// Tests the plugin contract kit itself: a well-behaved plugin passes every check, and each check
// fails for a plugin that breaks exactly its invariant. Without this, a check that silently stops
// checking would let every plugin through.
import { describe, expect, it } from 'vitest';
import { documentKey, type SourceDocument } from '#domains/document';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok } from '#kernel/result';
import { catalogKey, messageKey } from '#domains/catalog';
import type { Detection } from '../domain/detection.ts';
import type {
  CatalogFormat,
  CatalogLayout,
  PlaceholderToken,
  SourceCatalog,
} from '../application/ports/catalog-format.ts';
import type { DocumentFormat, DocumentLayout } from '../application/ports/document-format.ts';
import type { PluginModule } from '../application/ports/plugin-module.ts';
import { InMemoryProjectFiles } from '../adapters/in-memory-project-files.ts';
import { fakeCatalogPlugin } from './fake-catalog-plugin.ts';
import {
  fixtureChecksFor,
  placeholderProblems,
  pluginChecks,
  type FixtureUnderTest,
  type PluginContractOptions,
} from './plugin-contract.ts';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}
const path = (raw: string): ProjectPath => unwrap(projectPath(raw));
const locale = (raw: string): LocaleId => unwrap(localeId(raw));
const doc = (key: string, raw: string, loc = 'en'): SourceDocument => ({
  key: unwrap(documentKey(key)),
  path: path(raw),
  locale: locale(loc),
});

const tree = { 'en/a.md': 'a', 'en/b.md': 'b' };
const options: PluginContractOptions = {
  folder: '/somewhere/src/plugins/format-good',
  fixtures: [],
};
const subject: FixtureUnderTest = {
  fixture: {
    name: 'tree',
    root: '(in memory)',
    sourceLocale: 'en',
    targetLocales: ['he'],
    detected: true,
  },
  files: () => Promise.resolve(new InMemoryProjectFiles(tree)),
};

const manifest = {
  manifestVersion: 1,
  id: 'format-good',
  packageName: '@paperl10n/format-good',
  kind: 'document',
  apiVersion: 3,
  version: '1.0.0',
  displayName: 'Good',
  description: 'A well-behaved test plugin',
  license: 'GPL-3.0-or-later',
  author: { name: 'Test' },
  builtIn: true,
  capabilities: [],
  externalDependencies: [],
};

const goodLayout: DocumentLayout = {
  locales: [
    { locale: locale('en'), folder: path('en') },
    { locale: locale('he'), folder: path('he') },
  ],
  listSourceDocuments: () => Promise.resolve(ok([doc('a', 'en/a.md'), doc('b', 'en/b.md')])),
  targetPathFor: (document, target) => ok(path(`${target}/${document.key}.md`)),
  sourceLinkTarget: (target, locale) =>
    locale === 'he' ? target.replace(/^\/he(?=\/|$)/, '') || '/' : target,
};

const goodFormat: DocumentFormat = {
  kind: 'document',
  detect: async (files) =>
    (await files.exists(path('en')))
      ? { matches: true, confidence: 'fallback', evidence: [] }
      : { matches: false },
  open: (context) =>
    Promise.resolve(
      Object.keys(context.options).length > 0
        ? err({ code: 'formats.invalid-options', reason: 'no options' })
        : ok(goodLayout),
    ),
};

function pluginWith(
  overrides: Partial<DocumentFormat> = {},
  manifestPatch: object = {},
): PluginModule {
  return {
    manifest: { ...manifest, ...manifestPatch },
    create: () => ({ ...goodFormat, ...overrides }),
  };
}

function withLayout(layout: Partial<DocumentLayout>): PluginModule {
  return pluginWith({ open: () => Promise.resolve(ok({ ...goodLayout, ...layout })) });
}

async function runAll(
  plugin: PluginModule,
  { options: kitOptions, subject: kitSubject } = { options, subject },
): Promise<string[]> {
  const failed: string[] = [];
  // try/await catches both synchronous throws and rejections.
  const attempt = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch {
      failed.push(name);
    }
  };
  for (const [name, check] of Object.entries(pluginChecks)) {
    await attempt(name, () => check(plugin, kitOptions, kitSubject));
  }
  for (const [name, check] of Object.entries(fixtureChecksFor(plugin))) {
    await attempt(name, () => check(plugin, kitSubject));
  }
  return failed;
}

describe('the plugin contract kit', () => {
  it('passes a well-behaved plugin on every check', async () => {
    expect(await runAll(pluginWith())).toEqual([]);
  });

  let calls = 0;
  const flipFlop = (): Promise<Detection> =>
    Promise.resolve(
      calls++ % 2 === 0
        ? { matches: false }
        : { matches: true, confidence: 'likely', evidence: [] },
    );

  it.each<[string, PluginModule]>([
    ['manifest is valid', pluginWith({}, { version: 'not-semver' })],
    [
      "manifest id matches the plugin's folder name",
      pluginWith({}, { id: 'format-other', packageName: '@paperl10n/format-other' }),
    ],
    [
      'registers, and create() returns the kind the manifest declares',
      { manifest, create: () => ({ ...goodFormat, kind: 'catalog' }) as unknown as DocumentFormat },
    ],
    [
      'detect() on an empty project returns a result without failing',
      pluginWith({ detect: () => Promise.reject(new Error('boom')) }),
    ],
    [
      'open() on an empty project returns a layout or a plugin error, never a crash',
      pluginWith({ open: () => Promise.reject(new Error('boom')) }),
    ],
    [
      'rejects options it does not understand with formats.invalid-options',
      pluginWith({ open: () => Promise.resolve(ok(goodLayout)) }),
    ],
    [
      'detection matches the expectation, the same way every time',
      pluginWith({ detect: flipFlop }),
    ],
    [
      'detection matches the expectation, the same way every time',
      pluginWith({ detect: () => Promise.resolve({ matches: false }) }),
    ],
    [
      'lists source documents in a stable order, with unique keys, in the source locale, that exist',
      withLayout({
        listSourceDocuments: () => Promise.resolve(ok([doc('a', 'en/a.md'), doc('a', 'en/b.md')])),
      }),
    ],
    [
      'lists source documents in a stable order, with unique keys, in the source locale, that exist',
      withLayout({ listSourceDocuments: () => Promise.resolve(ok([doc('a', 'en/missing.md')])) }),
    ],
    [
      'lists source documents in a stable order, with unique keys, in the source locale, that exist',
      withLayout({ listSourceDocuments: () => Promise.resolve(ok([doc('a', 'en/a.md', 'fr')])) }),
    ],
    [
      'maps every document to itself for the source locale',
      withLayout({ targetPathFor: (d) => ok(path(`translated/${d.key}.md`)) }),
    ],
    [
      'maps documents to distinct target paths that are never a source path',
      withLayout({ targetPathFor: (d, t) => ok(path(t === locale('en') ? d.path : 'he/same.md')) }),
    ],
    [
      'maps documents to distinct target paths that are never a source path',
      withLayout({ targetPathFor: (d) => ok(d.path) }),
    ],
    [
      "lists the project's locales once each, the source locale included, where its documents are",
      withLayout({
        locales: [
          { locale: locale('en'), folder: path('en') },
          { locale: locale('en'), folder: path('english') },
        ],
      }),
    ],
    [
      "lists the project's locales once each, the source locale included, where its documents are",
      withLayout({ locales: [{ locale: locale('he'), folder: path('he') }] }),
    ],
    [
      "lists the project's locales once each, the source locale included, where its documents are",
      withLayout({ locales: [{ locale: locale('en'), folder: path('docs/en') }] }),
    ],
    [
      "maps link targets without failing, and leaves the source locale's as written",
      withLayout({ sourceLinkTarget: (target) => target.replace(/^\/[a-z]{2}\//, '/') }),
    ],
    [
      "maps link targets without failing, and leaves the source locale's as written",
      withLayout({
        sourceLinkTarget: (target, locale) => {
          if (locale === 'he') throw new Error('boom');
          return target;
        },
      }),
    ],
    [
      "maps documents into each listed locale's folder",
      withLayout({
        locales: [
          { locale: locale('en'), folder: path('en') },
          { locale: locale('he'), folder: path('hebrew') },
        ],
      }),
    ],
  ])('fails "%s" for a plugin that breaks it', async (check, plugin) => {
    expect(await runAll(plugin)).toContain(check);
  });

  it('catches an unstable listing order', async () => {
    let flips = 0;
    const plugin = withLayout({
      listSourceDocuments: () =>
        Promise.resolve(
          ok(
            flips++ % 2 === 0
              ? [doc('a', 'en/a.md'), doc('b', 'en/b.md')]
              : [doc('b', 'en/b.md'), doc('a', 'en/a.md')],
          ),
        ),
    });
    expect(await runAll(plugin)).toContain(
      'lists source documents in a stable order, with unique keys, in the source locale, that exist',
    );
  });
});

// Catalog plugins: the fake catalog plugin is the well-behaved one, and each broken plugin wraps it.

const catalogTree = {
  'i18n/en.cat':
    '# The source\nhello=Hello\nbye=Goodbye, $1\nitems={{PLURAL:$1|one item|$1 items}}\n',
  // CRLF, a message missing, and no line break at the end.
  'i18n/he.cat': '# Translators\r\nhello=שלום\r\nitems={{PLURAL:$1|פריט אחד|$1 פריטים}}',
  'i18n/qqq.cat': 'hello=A greeting\n',
  'api/en.cat': 'first=First\nsecond=<b>Second</b> [[Page|link]]\n',
};
const catalogKit = {
  options: { folder: '/somewhere/src/plugins/catalog-good/', fixtures: [] },
  subject: {
    fixture: {
      name: 'catalogs',
      root: '(in memory)',
      sourceLocale: 'en',
      targetLocales: ['he', 'fr'],
      detected: true,
    },
    files: () => Promise.resolve(new InMemoryProjectFiles(catalogTree)),
  },
};

const goodCatalog = (() => {
  const format = fakeCatalogPlugin('catalog-good').create({ apiVersion: 3 });
  if (format.kind !== 'catalog') throw new Error('test setup');
  return {
    ...format,
    detect: () =>
      Promise.resolve<Detection>({ matches: true, confidence: 'fallback', evidence: [] }),
  };
})();

function catalogWith(overrides: Partial<CatalogFormat>): PluginModule {
  const module = fakeCatalogPlugin('catalog-good');
  return { manifest: module.manifest, create: () => ({ ...goodCatalog, ...overrides }) };
}

function withCatalogLayout(patch: (good: CatalogLayout) => Partial<CatalogLayout>): PluginModule {
  return catalogWith({
    open: async (context) => {
      const layout = await goodCatalog.open(context);
      return layout.ok ? ok({ ...layout.value, ...patch(layout.value) }) : layout;
    },
  });
}

function withCatalogs(map: (catalogs: readonly SourceCatalog[]) => SourceCatalog[]): PluginModule {
  return withCatalogLayout((good) => ({
    listCatalogs: async () => {
      const catalogs = await good.listCatalogs();
      return catalogs.ok ? ok(map(catalogs.value)) : catalogs;
    },
  }));
}

function withTokens(
  map: (tokens: readonly PlaceholderToken[], text: string) => PlaceholderToken[],
): PluginModule {
  return catalogWith({
    placeholders: { scan: (text) => map(goodCatalog.placeholders.scan(text), text) },
  });
}

const runCatalog = (plugin: PluginModule) => runAll(plugin, catalogKit);

describe('the plugin contract kit, for catalog plugins', () => {
  it('passes a well-behaved catalog plugin on every check', async () => {
    expect(await runCatalog(catalogWith({}))).toEqual([]);
  });

  const listing =
    'lists catalogs in a stable order, each key once, in the source locale, with their files';
  const locales = "lists the project's catalog locales once each, the source locale included";
  const mapping =
    'maps each catalog to its own file for the source locale, and to distinct new files for the others';
  const roundTrip =
    'parses every catalog file with unique keys, and writes it back unchanged without changes';
  const editing = 'changes only the messages it is told to, and only where they are';
  const adding = 'adds a message after the nearest one before it in the source that the file has';
  const creating = 'writes a new file with its messages in source order';
  const scanning =
    'scans every message into tokens in order, inside the text, nested or apart, the same every time';
  const malformed = 'reads malformed text as formats.invalid-catalog, never a crash';

  let flips = 0;
  const he = locale('he');

  it.each<[string, string, PluginModule]>([
    [
      listing,
      'a listing order that changes',
      withCatalogs((c) => (flips++ % 2 ? [...c].reverse() : [...c])),
    ],
    [listing, 'a catalog listed twice', withCatalogs((c) => [...c, ...c])],
    [
      listing,
      'two catalogs with one key',
      withCatalogs((c) => c.map((x) => ({ ...x, key: unwrap(catalogKey('same')) }))),
    ],
    [
      listing,
      'a source file that does not exist',
      withCatalogs((c) => c.map((x) => ({ ...x, path: path(`${x.key}/missing.cat`) }))),
    ],
    [
      listing,
      'a catalog not in the source locale',
      withCatalogs((c) => c.map((x) => ({ ...x, locale: he }))),
    ],
    [
      listing,
      'documentation that does not exist',
      withCatalogs((c) => c.map((x) => ({ ...x, documentation: path(`${x.key}/missing.cat`) }))),
    ],
    [
      listing,
      'documentation that is the source file',
      withCatalogs((c) => c.map((x) => ({ ...x, documentation: x.path }))),
    ],
    [
      locales,
      'a locale listed twice',
      withCatalogLayout((good) => ({ locales: [...good.locales, he] })),
    ],
    [locales, 'no source locale', withCatalogLayout(() => ({ locales: [he] }))],
    [
      mapping,
      'the source locale mapped elsewhere',
      withCatalogLayout((good) => ({
        targetPathFor: (c, l) =>
          l === locale('en') ? ok(path(`${c.key}/source.cat`)) : good.targetPathFor(c, l),
      })),
    ],
    [
      mapping,
      'two locales mapped to one file',
      withCatalogLayout((good) => ({
        targetPathFor: (c, l) => good.targetPathFor(c, l === locale('fr') ? he : l),
      })),
    ],
    [
      mapping,
      'two catalogs mapped to one file',
      withCatalogLayout((good) => ({
        targetPathFor: (c, l) =>
          l === locale('fr') ? ok(path('fr.cat')) : good.targetPathFor(c, l),
      })),
    ],
    [
      mapping,
      'a target on the documentation',
      withCatalogLayout((good) => ({
        targetPathFor: (c, l) =>
          l === locale('fr') ? ok(path(`${c.key}/qqq.cat`)) : good.targetPathFor(c, l),
      })),
    ],
    [
      roundTrip,
      'line endings normalized on write',
      catalogWith({
        serialize: (edit) => {
          const written = goodCatalog.serialize(edit);
          return written.ok ? ok(written.value.replace(/\r\n/g, '\n')) : written;
        },
      }),
    ],
    [
      roundTrip,
      'duplicate keys parsed',
      catalogWith({
        parse: (text) => {
          const parsed = goodCatalog.parse(text);
          return parsed.ok
            ? ok({
                ...parsed.value,
                messages: [...parsed.value.messages, ...parsed.value.messages.slice(0, 1)],
              })
            : parsed;
        },
      }),
    ],
    [
      editing,
      'the whole file rewritten on any change',
      catalogWith({
        serialize: (edit) =>
          edit.changes.length === 0
            ? goodCatalog.serialize(edit)
            : goodCatalog.serialize({
                ...edit,
                target: null,
                changes: [
                  ...(edit.target?.messages ?? []).map((m) => ({ kind: 'set' as const, ...m })),
                  ...edit.changes,
                ],
              }),
      }),
    ],
    [
      editing,
      'removals ignored',
      catalogWith({
        serialize: (edit) =>
          goodCatalog.serialize({ ...edit, changes: edit.changes.filter((c) => c.kind === 'set') }),
      }),
    ],
    [
      editing,
      'line breaks not escaped',
      catalogWith({
        serialize: (edit) => {
          const written = goodCatalog.serialize(edit);
          return written.ok ? ok(written.value.replace(/\\n/g, '\n')) : written;
        },
      }),
    ],
    [
      adding,
      'new messages always first',
      catalogWith({
        serialize: (edit) =>
          goodCatalog.serialize(
            edit.target === null ? edit : { ...edit, source: { ...edit.source, messages: [] } },
          ),
      }),
    ],
    [
      creating,
      'a new file in the reverse of source order',
      catalogWith({
        serialize: (edit) =>
          goodCatalog.serialize(
            edit.target === null
              ? {
                  ...edit,
                  source: { ...edit.source, messages: [...edit.source.messages].reverse() },
                }
              : edit,
          ),
      }),
    ],
    [
      creating,
      'a message nobody set, in a new file without changes',
      catalogWith({
        serialize: (edit) =>
          goodCatalog.serialize(
            edit.target === null && edit.changes.length === 0
              ? {
                  ...edit,
                  changes: [
                    {
                      kind: 'set',
                      key: edit.source.messages[0]?.key ?? unwrap(messageKey('x')),
                      text: 'stray',
                    },
                    ...edit.changes,
                  ],
                }
              : edit,
          ),
      }),
    ],
    [
      editing,
      'a line break added at the end when a message changes',
      catalogWith({
        serialize: (edit) => {
          const written = goodCatalog.serialize(edit);
          const ending = edit.target !== null && !/[\r\n]$/.test(edit.target.text);
          const changes = edit.changes.some((c) =>
            edit.target?.messages.some(
              (m) => c.kind === 'set' && m.key === c.key && m.text !== c.text,
            ),
          );
          return written.ok && ending && changes ? ok(`${written.value}\r\n`) : written;
        },
      }),
    ],
    [
      editing,
      'a line added when removing a message the file lacks',
      catalogWith({
        serialize: (edit) => {
          const written = goodCatalog.serialize(edit);
          const lacks = edit.changes.some(
            (c) => !edit.target?.messages.some((m) => m.key === c.key),
          );
          return written.ok && lacks ? ok(`${written.value}\n`) : written;
        },
      }),
    ],
    [
      editing,
      'a message set to its own text moved first',
      catalogWith({
        serialize: (edit) => {
          const same = (key: string, text: string) =>
            edit.target?.messages.some((m) => m.key === key && m.text === text) ?? false;
          const changes = edit.changes.flatMap((c) =>
            c.kind === 'set' && same(c.key, c.text)
              ? [{ kind: 'remove' as const, key: c.key }, c]
              : [c],
          );
          return goodCatalog.serialize({
            ...edit,
            source: { ...edit.source, messages: [] },
            changes,
          });
        },
      }),
    ],
    [scanning, 'tokens out of order', withTokens((tokens) => [...tokens].reverse())],
    [
      scanning,
      'a token past the end',
      withTokens((tokens, text) => [
        ...tokens,
        { kind: 'other', text: '', start: text.length, end: text.length + 1 },
      ]),
    ],
    [
      scanning,
      'an empty token',
      withTokens((tokens) => [{ kind: 'parameter', text: '', start: 0, end: 0 }, ...tokens]),
    ],
    [
      scanning,
      'a token whose text is not at its range',
      withTokens((tokens) => tokens.map((t) => ({ ...t, text: `${t.text}x` }))),
    ],
    [
      scanning,
      'tokens partly overlapping',
      withTokens((tokens, text) =>
        text.length < 3
          ? [...tokens]
          : [
              { kind: 'other', text: text.slice(0, 2), start: 0, end: 2 },
              { kind: 'other', text: text.slice(1, 3), start: 1, end: 3 },
            ],
      ),
    ],
    [scanning, 'each token twice', withTokens((tokens) => tokens.flatMap((t) => [t, t]))],
    [
      scanning,
      'a tag name not lowercased',
      withTokens((tokens) =>
        tokens.map((t) => (t.kind === 'tag' ? { ...t, name: t.name.toUpperCase() } : t)),
      ),
    ],
    [
      scanning,
      'a link without a target',
      withTokens((tokens) => tokens.map((t) => (t.kind === 'link' ? { ...t, target: '' } : t))),
    ],
    [scanning, 'a scan that changes', withTokens((tokens) => (flips++ % 2 ? [...tokens] : []))],
    [
      scanning,
      'a scan that throws',
      catalogWith({
        placeholders: {
          scan: (text) => {
            if (text.includes('{{')) throw new Error('boom');
            return [];
          },
        },
      }),
    ],
    [
      malformed,
      'a parse that throws',
      catalogWith({
        parse: (text) => {
          const parsed = goodCatalog.parse(text);
          if (!parsed.ok) throw new Error('boom');
          return parsed;
        },
      }),
    ],
    [
      malformed,
      'another error code',
      catalogWith({
        parse: (text) => {
          const parsed = goodCatalog.parse(text);
          return parsed.ok ? parsed : err({ code: 'formats.unsupported-project', reason: 'bad' });
        },
      }),
    ],
  ])('fails "%s" for a plugin with %s', async (check, _broken, plugin) => {
    expect(await runCatalog(plugin)).toContain(check);
  });
});

describe('placeholderProblems', () => {
  it('accepts nested and separate tokens in order', () => {
    const text = '{{PLURAL:$1|a|$1}} $2';
    expect(
      placeholderProblems(text, [
        { kind: 'plural', parameter: '$1', text: '{{PLURAL:$1|a|$1}}', start: 0, end: 18 },
        { kind: 'parameter', text: '$1', start: 9, end: 11 },
        { kind: 'parameter', text: '$1', start: 14, end: 16 },
        { kind: 'parameter', text: '$2', start: 19, end: 21 },
      ]),
    ).toEqual([]);
  });

  it('accepts tokens sharing a start, the enclosing one first', () => {
    expect(
      placeholderProblems('$1x', [
        { kind: 'other', text: '$1x', start: 0, end: 3 },
        { kind: 'parameter', text: '$1', start: 0, end: 2 },
      ]),
    ).toEqual([]);
  });

  it('rejects the inner token first when they share a start', () => {
    expect(
      placeholderProblems('$1x', [
        { kind: 'parameter', text: '$1', start: 0, end: 2 },
        { kind: 'other', text: '$1x', start: 0, end: 3 },
      ]),
    ).toHaveLength(1);
  });
});
