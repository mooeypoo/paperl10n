// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { documentKey, type SourceDocument } from '#domains/document';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { PROJECT_ROOT, projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok } from '#kernel/result';
import { InMemoryProjectFiles } from '../adapters/in-memory-project-files.ts';
import type { Detection } from '../domain/detection.ts';
import type { CatalogFormat, CatalogLocation, ParsedCatalog } from './ports/catalog-format.ts';
import type { DocumentFormat, DocumentLayout } from './ports/document-format.ts';
import type { FormatContext } from './ports/format-context.ts';
import type { PluginHost, PluginModule } from './ports/plugin-module.ts';
import { createFormatRegistry, type FormatRegistry } from './format-registry.ts';

const host: PluginHost = { apiVersion: 2 };

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`test setup: ${JSON.stringify(result.error)}`);
  return result.value;
}
const path = (raw: string): ProjectPath => unwrap(projectPath(raw));
const locale = (raw: string): LocaleId => unwrap(localeId(raw));

function manifest(
  id: string,
  kind: 'document' | 'catalog' = id.startsWith('format-') ? 'document' : 'catalog',
) {
  return {
    manifestVersion: 1,
    id,
    packageName: `@paperl10n/${id}`,
    kind,
    apiVersion: 2,
    version: '0.1.0',
    displayName: id,
    description: 'test plugin',
    license: 'GPL-3.0-or-later',
    author: { name: 'Test' },
    builtIn: true,
    capabilities: [],
    externalDependencies: [],
  };
}

const intro: SourceDocument = {
  key: unwrap(documentKey('intro')),
  path: path('en/intro.md'),
  locale: locale('en'),
};

const workingLayout: DocumentLayout = {
  locales: [
    { locale: locale('en'), folder: path('en') },
    { locale: locale('he'), folder: path('he') },
  ],
  listSourceDocuments: () => Promise.resolve(ok([intro])),
  targetPathFor: (document, target) => ok(path(`${target}/${document.key}.md`)),
};

function documentModule(id: string, overrides: Partial<DocumentFormat> = {}): PluginModule {
  const plugin: DocumentFormat = {
    kind: 'document',
    detect: () => Promise.resolve<Detection>({ matches: false }),
    open: () => Promise.resolve(ok(workingLayout)),
    ...overrides,
  };
  return { manifest: manifest(id), create: () => plugin };
}

function detecting(confidence: 'certain' | 'likely' | 'fallback'): Partial<DocumentFormat> {
  return { detect: () => Promise.resolve<Detection>({ matches: true, confidence, evidence: [] }) };
}

const location: CatalogLocation = {
  path: path('i18n/en.json'),
  locale: locale('en'),
  role: 'messages',
};
const parsed: ParsedCatalog = { location, messages: [], source: '{}' };

function catalogModule(id: string, overrides: Partial<CatalogFormat> = {}): PluginModule {
  const plugin: CatalogFormat = {
    kind: 'catalog',
    detect: () => Promise.resolve<Detection>({ matches: false }),
    open: () =>
      Promise.resolve(
        ok({
          listCatalogs: () => Promise.resolve(ok([location])),
          catalogPathFor: (target: LocaleId) => ok(path(`i18n/${target}.json`)),
        }),
      ),
    parse: () => ok(parsed),
    serialize: () => ok('{}'),
    placeholders: { scan: () => [{ text: '$1', start: 0, end: 2 }] },
    ...overrides,
  };
  return { manifest: manifest(id), create: () => plugin };
}

function registry(modules: PluginModule[]): FormatRegistry {
  return unwrap(createFormatRegistry(modules, host));
}

const files = new InMemoryProjectFiles({ 'en/intro.md': '# Intro\n' });
const context: FormatContext = { files, sourceLocale: locale('en'), options: {} };
const boom = () => {
  throw new Error('boom');
};

describe('createFormatRegistry: registration', () => {
  it('registers plugins by kind, sorted by id, and finds them by id', () => {
    const formats = registry([
      documentModule('format-b'),
      catalogModule('catalog-a'),
      documentModule('format-a'),
    ]);
    expect(formats.documentFormats.map((f) => f.manifest.id)).toEqual(['format-a', 'format-b']);
    expect(formats.catalogFormats.map((f) => f.manifest.id)).toEqual(['catalog-a']);
    expect(formats.find('format-b')?.kind).toBe('document');
    expect(formats.find('format-nope')).toBeUndefined();
  });

  it('passes the host to create()', () => {
    let received: PluginHost | undefined;
    const module: PluginModule = {
      manifest: manifest('format-a'),
      create: (h) => {
        received = h;
        return {
          kind: 'document',
          detect: () => Promise.resolve({ matches: false }),
          open: () => Promise.resolve(ok(workingLayout)),
        };
      },
    };
    registry([module]);
    expect(received).toBe(host);
  });

  it('accepts an empty plugin set', () => {
    expect(registry([]).documentFormats).toEqual([]);
  });

  it.each<[string, PluginModule[], { pluginId?: string; problem: string }[]]>([
    [
      'an invalid manifest',
      [{ manifest: { ...manifest('format-a'), version: 'x' }, create: () => unwrapPlugin() }],
      [{ pluginId: 'format-a', problem: 'manifest-invalid' }],
    ],
    [
      'a manifest without a readable id',
      [{ manifest: { ...manifest('format-a'), id: 7 }, create: () => unwrapPlugin() }],
      [{ problem: 'manifest-invalid' }],
    ],
    [
      'duplicate ids',
      [documentModule('format-a'), documentModule('format-a')],
      [{ pluginId: 'format-a', problem: 'duplicate-id' }],
    ],
    [
      'a factory that throws',
      [{ manifest: manifest('format-a'), create: boom }],
      [{ pluginId: 'format-a', problem: 'create-failed' }],
    ],
    [
      'a plugin whose kind contradicts its manifest',
      [{ manifest: manifest('catalog-a'), create: () => unwrapPlugin() }],
      [{ pluginId: 'catalog-a', problem: 'kind-mismatch' }],
    ],
    [
      'several problems at once',
      [
        documentModule('format-a'),
        documentModule('format-a'),
        { manifest: manifest('format-b'), create: boom },
      ],
      [
        { pluginId: 'format-a', problem: 'duplicate-id' },
        { pluginId: 'format-b', problem: 'create-failed' },
      ],
    ],
  ])('rejects %s', (_description, modules, expected) => {
    const result = createFormatRegistry(modules, host);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('formats.registry-invalid');
      expect(
        result.error.problems.map(({ pluginId, problem }) =>
          pluginId === undefined ? { problem } : { pluginId, problem },
        ),
      ).toEqual(expected);
      for (const p of result.error.problems) expect(p.detail).not.toBe('');
    }
  });
});

function unwrapPlugin(): DocumentFormat {
  return {
    kind: 'document',
    detect: () => Promise.resolve({ matches: false }),
    open: () => Promise.resolve(ok(workingLayout)),
  };
}

describe('FormatRegistry.detect', () => {
  it('returns matches best first, ties broken by id, and leaves out non-matches', async () => {
    const formats = registry([
      documentModule('format-fallback', detecting('fallback')),
      documentModule('format-none'),
      documentModule('format-b-likely', detecting('likely')),
      documentModule('format-certain', detecting('certain')),
      documentModule('format-a-likely', detecting('likely')),
    ]);
    const report = await formats.detect(files);
    expect(report.matches.map((m) => [m.format.manifest.id, m.confidence])).toEqual([
      ['format-certain', 'certain'],
      ['format-a-likely', 'likely'],
      ['format-b-likely', 'likely'],
      ['format-fallback', 'fallback'],
    ]);
    expect(report.failures).toEqual([]);
  });

  it('keeps the evidence a plugin reports', async () => {
    const evidence = [path('.vitepress/config.ts')];
    const formats = registry([
      documentModule('format-a', {
        detect: () =>
          Promise.resolve<Detection>({ matches: true, confidence: 'certain', evidence }),
      }),
    ]);
    expect((await formats.detect(files)).matches[0]?.evidence).toEqual(evidence);
  });

  it('reports a throwing or rejecting detect() as a failure and keeps going', async () => {
    const formats = registry([
      documentModule('format-throws', { detect: boom }),
      documentModule('format-rejects', { detect: () => Promise.reject(new Error('nope')) }),
      documentModule('format-ok', detecting('likely')),
    ]);
    const report = await formats.detect(files);
    expect(report.matches.map((m) => m.format.manifest.id)).toEqual(['format-ok']);
    expect(report.failures).toEqual([
      { code: 'formats.plugin-failed', formatId: 'format-rejects', reason: 'nope' },
      { code: 'formats.plugin-failed', formatId: 'format-throws', reason: 'boom' },
    ]);
  });

  it('describes a thrown non-Error value', async () => {
    const formats = registry([
      documentModule('format-a', {
        detect: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing a misbehaving plugin
          throw 'a string';
        },
      }),
    ]);
    expect((await formats.detect(files)).failures[0]).toMatchObject({ reason: 'a string' });
  });
});

describe('guarded document formats', () => {
  async function openLayout(overrides: Partial<DocumentFormat>) {
    const format = registry([documentModule('format-a', overrides)]).find('format-a');
    if (format?.kind !== 'document') throw new Error('test setup');
    return format.open(context);
  }

  it('passes a working layout through', async () => {
    const layout = unwrap(await openLayout({}));
    expect(layout.locales).toEqual([
      { locale: 'en', folder: 'en' },
      { locale: 'he', folder: 'he' },
    ]);
    expect(await layout.listSourceDocuments()).toEqual({ ok: true, value: [intro] });
    expect(layout.targetPathFor(intro, locale('he'))).toEqual({ ok: true, value: 'he/intro.md' });
  });

  it('adds the plugin id to errors the plugin returns', async () => {
    const result = await openLayout({
      open: () =>
        Promise.resolve(err({ code: 'formats.invalid-options', reason: 'root must be a string' })),
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'formats.invalid-options',
        reason: 'root must be a string',
        formatId: 'format-a',
      },
    });
  });

  it.each<[string, Partial<DocumentFormat>]>([
    ['open() throws', { open: boom }],
    ['open() rejects', { open: () => Promise.reject(new Error('boom')) }],
  ])('turns a crash into formats.plugin-failed: %s', async (_description, overrides) => {
    expect(await openLayout(overrides)).toEqual({
      ok: false,
      error: { code: 'formats.plugin-failed', formatId: 'format-a', reason: 'boom' },
    });
  });

  it('guards the layout methods too', async () => {
    const layout = unwrap(
      await openLayout({
        open: () =>
          Promise.resolve(
            ok<DocumentLayout>({
              locales: [],
              listSourceDocuments: () => Promise.reject(new Error('boom')),
              targetPathFor: boom,
              sourceLinkTarget: boom,
            }),
          ),
      }),
    );
    const failed = {
      ok: false,
      error: { code: 'formats.plugin-failed', formatId: 'format-a', reason: 'boom' },
    };
    expect(await layout.listSourceDocuments()).toEqual(failed);
    expect(layout.targetPathFor(intro, locale('he'))).toEqual(failed);
    expect(layout.sourceLinkTarget('/he/x/', locale('he'))).toEqual(failed);
  });

  it('maps link targets with the plugin’s method, or leaves them as written without one', async () => {
    const plain = unwrap(await openLayout({}));
    expect(plain.sourceLinkTarget('/he/x/', locale('he'))).toEqual({ ok: true, value: '/he/x/' });
    const mapping = unwrap(
      await openLayout({
        open: () =>
          Promise.resolve(
            ok<DocumentLayout>({
              locales: [],
              listSourceDocuments: () => Promise.resolve(ok([])),
              targetPathFor: () => ok(path('he/x.md')),
              sourceLinkTarget: (target, to) => (to === 'he' ? target.slice(3) : target),
            }),
          ),
      }),
    );
    expect(mapping.sourceLinkTarget('/he/x/', locale('he'))).toEqual({ ok: true, value: '/x/' });
  });

  it('adds the plugin id to errors from layout methods', async () => {
    const cause = { code: 'files.not-found' as const, path: PROJECT_ROOT };
    const layout = unwrap(
      await openLayout({
        open: () =>
          Promise.resolve(
            ok<DocumentLayout>({
              locales: [],
              listSourceDocuments: () =>
                Promise.resolve(err({ code: 'formats.file-access', cause })),
              targetPathFor: () =>
                err({ code: 'formats.unsupported-project', reason: 'no locale folders' }),
            }),
          ),
      }),
    );
    expect(await layout.listSourceDocuments()).toEqual({
      ok: false,
      error: { code: 'formats.file-access', cause, formatId: 'format-a' },
    });
    expect(layout.targetPathFor(intro, locale('he'))).toEqual({
      ok: false,
      error: {
        code: 'formats.unsupported-project',
        reason: 'no locale folders',
        formatId: 'format-a',
      },
    });
  });
});

describe('guarded catalog formats', () => {
  function catalogFormat(overrides: Partial<CatalogFormat>) {
    const format = registry([catalogModule('catalog-a', overrides)]).find('catalog-a');
    if (format?.kind !== 'catalog') throw new Error('test setup');
    return format;
  }

  it('passes working calls through', async () => {
    const format = catalogFormat({});
    expect(await format.detect(files)).toEqual({ ok: true, value: { matches: false } });
    const layout = unwrap(await format.open(context));
    expect(await layout.listCatalogs()).toEqual({ ok: true, value: [location] });
    expect(layout.catalogPathFor(locale('he'))).toEqual({ ok: true, value: 'i18n/he.json' });
    expect(format.parse('{}', location)).toEqual({ ok: true, value: parsed });
    expect(format.serialize(parsed, [])).toEqual({ ok: true, value: '{}' });
    expect(format.scanPlaceholders('$1')).toEqual({
      ok: true,
      value: [{ text: '$1', start: 0, end: 2 }],
    });
  });

  it('turns crashes in every call into formats.plugin-failed', async () => {
    const failed = {
      ok: false,
      error: { code: 'formats.plugin-failed', formatId: 'catalog-a', reason: 'boom' },
    };
    const format = catalogFormat({ parse: boom, serialize: boom, placeholders: { scan: boom } });
    expect(format.parse('{}', location)).toEqual(failed);
    expect(format.serialize(parsed, [])).toEqual(failed);
    expect(format.scanPlaceholders('$1')).toEqual(failed);

    const crashingLayout = catalogFormat({
      open: () =>
        Promise.resolve(
          ok({ listCatalogs: () => Promise.reject(new Error('boom')), catalogPathFor: boom }),
        ),
    });
    const layout = unwrap(await crashingLayout.open(context));
    expect(await layout.listCatalogs()).toEqual(failed);
    expect(layout.catalogPathFor(locale('he'))).toEqual(failed);
    expect(await catalogFormat({ open: boom }).open(context)).toEqual(failed);
  });

  it('adds the plugin id to errors the plugin returns', () => {
    const format = catalogFormat({
      parse: () => err({ code: 'formats.unsupported-project', reason: 'not JSON' }),
    });
    expect(format.parse('x', location)).toEqual({
      ok: false,
      error: { code: 'formats.unsupported-project', reason: 'not JSON', formatId: 'catalog-a' },
    });
  });
});
