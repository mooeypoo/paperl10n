// SPDX-License-Identifier: GPL-3.0-or-later
// Tests the plugin contract kit itself: a well-behaved plugin passes every check, and each check
// fails for a plugin that breaks exactly its invariant. Without this, a check that silently stops
// checking would let every plugin through.
import { describe, expect, it } from 'vitest';
import { documentKey, type SourceDocument } from '#domains/document';
import { localeId, type LocaleId } from '#kernel/locale-id';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok } from '#kernel/result';
import type { Detection } from '../domain/detection.ts';
import type { DocumentFormat, DocumentLayout } from '../application/ports/document-format.ts';
import type { PluginModule } from '../application/ports/plugin-module.ts';
import { InMemoryProjectFiles } from './in-memory-project-files.ts';
import {
  fixtureChecks,
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
  apiVersion: 1,
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
  declaredLocales: [],
  listSourceDocuments: () => Promise.resolve(ok([doc('a', 'en/a.md'), doc('b', 'en/b.md')])),
  targetPathFor: (document, target) => ok(path(`${target}/${document.key}.md`)),
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

async function runAll(plugin: PluginModule): Promise<string[]> {
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
    await attempt(name, () => check(plugin, options, subject));
  }
  for (const [name, check] of Object.entries(fixtureChecks)) {
    await attempt(name, () => check(plugin, subject));
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
