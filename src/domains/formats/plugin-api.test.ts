// SPDX-License-Identifier: GPL-3.0-or-later
// Freezes the plugin API. If this test fails, you changed what plugins can see: make sure that's
// intended, update docs/domains/formats.md, and consider whether it needs a new apiVersion.
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as pluginApi from '#plugin-api';
import * as pluginApiTesting from '#plugin-api/testing';
import {
  documentKey,
  err,
  localeId,
  messageKey,
  ok,
  projectPath,
  type CatalogFormat,
  type DocumentFormat,
  type FormatPlugin,
  type ParsedCatalog,
  type PlaceholderToken,
  type PluginModule,
  type ProjectPath,
  type SourceDocument,
} from '#plugin-api';

describe('#plugin-api', () => {
  it('exports exactly these runtime values (types are checked by the compile below)', () => {
    expect(Object.keys(pluginApi).sort()).toEqual([
      'PROJECT_ROOT',
      'documentKey',
      'err',
      'localeId',
      'messageKey',
      'ok',
      'projectPath',
    ]);
  });

  it('is enough to write a complete document plugin, with no other imports', () => {
    // A minimal plugin written only against #plugin-api. If a type it needs stops being exported,
    // this stops compiling (pnpm typecheck covers test files).
    const sourceLocale = localeId('en');
    const key = documentKey('index');
    const path = projectPath('en/index.md');
    if (!sourceLocale.ok || !key.ok || !path.ok) throw new Error('test setup');
    const document: SourceDocument = {
      key: key.value,
      path: path.value,
      locale: sourceLocale.value,
    };

    const format: DocumentFormat = {
      kind: 'document',
      detect: () => Promise.resolve({ matches: false }),
      open: () =>
        Promise.resolve(
          ok({
            locales: [],
            listSourceDocuments: () => Promise.resolve(ok([document])),
            targetPathFor: (_doc, target) => {
              const target_ = projectPath(`${target}/index.md`);
              return target_.ok
                ? ok(target_.value)
                : { ok: false, error: { code: 'formats.unsupported-project', reason: 'bad path' } };
            },
          }),
        ),
    };
    const module: PluginModule = { manifest: {}, create: () => format };

    expectTypeOf(module.create({ apiVersion: 3 })).toEqualTypeOf<FormatPlugin>();
    expectTypeOf(document.path).toEqualTypeOf<ProjectPath>();
  });

  it('is enough to write a complete catalog plugin, with no other imports', () => {
    const sourceLocale = localeId('en');
    const folder = projectPath('i18n');
    const path = projectPath('i18n/en.json');
    if (!sourceLocale.ok || !folder.ok || !path.ok) throw new Error('test setup');
    const catalog = { folder: folder.value, path: path.value, locale: sourceLocale.value };

    const parse = (text: string) => {
      const key = messageKey(text);
      return key.ok
        ? ok<ParsedCatalog>({ text, messages: [{ key: key.value, text }] })
        : err({ code: 'formats.invalid-catalog' as const, reason: 'empty' });
    };
    const token: PlaceholderToken = {
      kind: 'plural',
      parameter: '$1',
      text: '{{PLURAL:$1|}}',
      start: 0,
      end: 14,
    };
    const format: CatalogFormat = {
      kind: 'catalog',
      detect: () => Promise.resolve({ matches: false }),
      open: () =>
        Promise.resolve(
          ok({
            locales: [sourceLocale.value],
            listCatalogs: () => Promise.resolve(ok([catalog])),
            targetPathFor: (_catalog, locale) => {
              const target = projectPath(`i18n/${locale}.json`);
              return target.ok
                ? ok(target.value)
                : err({ code: 'formats.unsupported-project', reason: 'bad path' });
            },
          }),
        ),
      parse,
      serialize: (edit) => ok(edit.target?.text ?? edit.source.text),
      placeholders: { scan: () => [token] },
    };
    const module: PluginModule = { manifest: {}, create: () => format };

    expectTypeOf(module.create({ apiVersion: 3 })).toEqualTypeOf<FormatPlugin>();
  });
});

describe('#plugin-api/testing', () => {
  it('exports exactly these runtime values', () => {
    expect(Object.keys(pluginApiTesting).sort()).toEqual([
      'InMemoryProjectFiles',
      'describePluginContract',
      'openFixture',
    ]);
  });
});
