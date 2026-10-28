// SPDX-License-Identifier: GPL-3.0-or-later
// Freezes the plugin API. If this test fails, you changed what plugins can see: make sure that's
// intended, update docs/domains/formats.md, and consider whether it needs a new apiVersion.
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as pluginApi from '#plugin-api';
import * as pluginApiTesting from '#plugin-api/testing';
import {
  documentKey,
  localeId,
  ok,
  projectPath,
  type DocumentFormat,
  type FormatPlugin,
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
            declaredLocales: [],
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

    expectTypeOf(module.create({ apiVersion: 1 })).toEqualTypeOf<FormatPlugin>();
    expectTypeOf(document.path).toEqualTypeOf<ProjectPath>();
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
