// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin contract kit: the invariants every plugin must hold, checked the same way for all
// of them. A plugin's test file calls `describePluginContract(plugin, …)` once. Exposed to plugins
// as `#plugin-api/testing`. Each invariant is a named check, so the kit itself is tested against
// deliberately broken plugins (plugin-contract.test.ts).
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localeId, type LocaleId } from '#kernel/locale-id';
import type { Result } from '#kernel/result';
import { openNodeProjectFiles } from '../adapters/node-project-files.ts';
import {
  createFormatRegistry,
  type GuardedDocumentLayout,
  type RegisteredDocumentFormat,
} from '../application/format-registry.ts';
import type { FormatError } from '../application/ports/plugin-error.ts';
import type { PluginModule } from '../application/ports/plugin-module.ts';
import type { ProjectFiles } from '../application/ports/project-files.ts';
import { parsePluginManifest } from '../domain/plugin-manifest.ts';
import { InMemoryProjectFiles } from '../adapters/in-memory-project-files.ts';

export interface PluginFixture {
  /** A short name for test titles. */
  readonly name: string;
  /** Absolute path of the sample project. */
  readonly root: string;
  readonly sourceLocale: string;
  /** Locales to check `targetPathFor` with. */
  readonly targetLocales: readonly string[];
  /** The plugin's options for this project (its section of paperl10n.config.json). */
  readonly options?: Readonly<Record<string, unknown>>;
  /** Whether `detect` should recognize this project. */
  readonly detected: boolean;
}

export interface PluginContractOptions {
  /** The plugin's folder (e.g. `new URL('.', import.meta.url).pathname`); its name must be the id. */
  readonly folder: string;
  readonly fixtures: readonly PluginFixture[];
}

/** Opens a sample project on disk, for plugin tests. */
export async function openFixture(root: string): Promise<ProjectFiles> {
  const files = await openNodeProjectFiles(root);
  if (!files.ok) throw new Error(`fixture ${root}: ${files.error.code}`);
  return files.value;
}

function parseLocale(raw: string): LocaleId {
  const id = localeId(raw);
  if (!id.ok) throw new Error(`fixture: invalid locale ${raw}`);
  return id.value;
}

/** Fails with the plugin's error spelled out, instead of a bare `ok: false`. */
function expectOk<T>(result: Result<T, FormatError>, what: string): T {
  if (!result.ok) expect.fail(`${what} failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

function registered(plugin: PluginModule): RegisteredDocumentFormat {
  const registry = createFormatRegistry([plugin], { apiVersion: 2 });
  if (!registry.ok) expect.fail(`registration failed: ${JSON.stringify(registry.error)}`);
  const format = registry.value.documentFormats[0];
  if (format === undefined) expect.fail('the kit supports document plugins in API v1');
  return format;
}

/** What a fixture check gets: the fixture, and a way to open its files. */
export interface FixtureUnderTest {
  readonly fixture: PluginFixture;
  readonly files: () => Promise<ProjectFiles>;
}

async function openLayout(
  plugin: PluginModule,
  subject: FixtureUnderTest,
): Promise<GuardedDocumentLayout> {
  return expectOk(
    await registered(plugin).open({
      files: await subject.files(),
      sourceLocale: parseLocale(subject.fixture.sourceLocale),
      options: subject.fixture.options ?? {},
    }),
    'open',
  );
}

/** Checks about the plugin as a whole. Each throws (an assertion error) when violated. */
export const pluginChecks: Readonly<
  Record<
    string,
    (
      plugin: PluginModule,
      options: PluginContractOptions,
      subject: FixtureUnderTest,
    ) => Promise<void>
  >
> = {
  'manifest is valid': (plugin) => {
    const manifest = parsePluginManifest(plugin.manifest);
    expect(manifest.ok ? [] : manifest.error.problems).toEqual([]);
    return Promise.resolve();
  },
  "manifest id matches the plugin's folder name": (plugin, options) => {
    const manifest = parsePluginManifest(plugin.manifest);
    expect(manifest.ok && manifest.value.id).toBe(basename(options.folder.replace(/\/$/, '')));
    return Promise.resolve();
  },
  'registers, and create() returns the kind the manifest declares': (plugin) => {
    registered(plugin);
    return Promise.resolve();
  },
  'detect() on an empty project returns a result without failing': async (plugin) => {
    expectOk(await registered(plugin).detect(new InMemoryProjectFiles({})), 'detect');
  },
  'open() on an empty project returns a layout or a plugin error, never a crash': async (
    plugin,
  ) => {
    const opened = await registered(plugin).open({
      files: new InMemoryProjectFiles({}),
      sourceLocale: parseLocale('en'),
      options: {},
    });
    expect(opened.ok ? 'ok' : opened.error.code).not.toBe('formats.plugin-failed');
  },
  'rejects options it does not understand with formats.invalid-options': async (
    plugin,
    _options,
    subject,
  ) => {
    const opened = await registered(plugin).open({
      files: await subject.files(),
      sourceLocale: parseLocale(subject.fixture.sourceLocale),
      options: { ...subject.fixture.options, notARealOption: true },
    });
    expect(opened.ok ? 'ok' : opened.error.code).toBe('formats.invalid-options');
  },
};

/** Checks run against each fixture. Each throws (an assertion error) when violated. */
export const fixtureChecks: Readonly<
  Record<string, (plugin: PluginModule, subject: FixtureUnderTest) => Promise<void>>
> = {
  'detection matches the expectation, the same way every time': async (plugin, subject) => {
    const files = await subject.files();
    const first = expectOk(await registered(plugin).detect(files), 'detect');
    const second = expectOk(await registered(plugin).detect(files), 'detect');
    expect(second).toEqual(first);
    expect(first.matches).toBe(subject.fixture.detected);
  },
  'lists source documents in a stable order, with unique keys, in the source locale, that exist':
    async (plugin, subject) => {
      const files = await subject.files();
      const layout = await openLayout(plugin, { ...subject, files: () => Promise.resolve(files) });
      const documents = expectOk(await layout.listSourceDocuments(), 'listSourceDocuments');
      expect(expectOk(await layout.listSourceDocuments(), 'listSourceDocuments')).toEqual(
        documents,
      );
      expect(new Set(documents.map((d) => d.key)).size).toBe(documents.length);
      const sourceLocale = parseLocale(subject.fixture.sourceLocale);
      for (const document of documents) {
        expect(document.locale).toBe(sourceLocale);
        expect(await files.exists(document.path)).toBe(true);
      }
    },
  'maps every document to itself for the source locale': async (plugin, subject) => {
    const layout = await openLayout(plugin, subject);
    const sourceLocale = parseLocale(subject.fixture.sourceLocale);
    for (const document of expectOk(await layout.listSourceDocuments(), 'listSourceDocuments')) {
      expect(expectOk(layout.targetPathFor(document, sourceLocale), 'targetPathFor')).toBe(
        document.path,
      );
    }
  },
  'maps documents to distinct target paths that are never a source path': async (
    plugin,
    subject,
  ) => {
    const layout = await openLayout(plugin, subject);
    const documents = expectOk(await layout.listSourceDocuments(), 'listSourceDocuments');
    const sourcePaths = new Set<string>(documents.map((d) => d.path));
    for (const raw of subject.fixture.targetLocales) {
      const targets = documents.map((document) =>
        expectOk(layout.targetPathFor(document, parseLocale(raw)), 'targetPathFor'),
      );
      expect(new Set(targets).size).toBe(targets.length);
      for (const target of targets) expect(sourcePaths.has(target)).toBe(false);
    }
  },
  "lists the project's locales once each, the source locale included, where its documents are":
    async (plugin, subject) => {
      const layout = await openLayout(plugin, subject);
      const locales = layout.locales.map((l) => l.locale);
      expect(new Set(locales).size).toBe(locales.length);
      const sourceLocale = parseLocale(subject.fixture.sourceLocale);
      const source = layout.locales.find((l) => l.locale === sourceLocale);
      expect(source, 'the source locale is listed').toBeDefined();
      const inFolder = (folder: string, path: string) =>
        folder === '' || path.startsWith(`${folder}/`);
      for (const document of expectOk(await layout.listSourceDocuments(), 'listSourceDocuments')) {
        expect(inFolder(source?.folder ?? '', document.path), document.path).toBe(true);
      }
    },
  "maps link targets without failing, and leaves the source locale's as written": async (
    plugin,
    subject,
  ) => {
    const layout = await openLayout(plugin, subject);
    const samples = [
      '/guide/',
      '/he/guide/#top',
      'guide.md',
      '../x/',
      'https://example.org/a',
      '#top',
      '',
    ];
    const sourceLocale = parseLocale(subject.fixture.sourceLocale);
    for (const sample of samples) {
      expect(expectOk(layout.sourceLinkTarget(sample, sourceLocale), 'sourceLinkTarget')).toBe(
        sample,
      );
      for (const raw of subject.fixture.targetLocales) {
        const mapped = expectOk(
          layout.sourceLinkTarget(sample, parseLocale(raw)),
          'sourceLinkTarget',
        );
        expect(typeof mapped).toBe('string');
      }
    }
  },
  "maps documents into each listed locale's folder": async (plugin, subject) => {
    const layout = await openLayout(plugin, subject);
    const documents = expectOk(await layout.listSourceDocuments(), 'listSourceDocuments');
    for (const { locale, folder } of layout.locales) {
      for (const document of documents) {
        const target = expectOk(layout.targetPathFor(document, locale), 'targetPathFor');
        expect(folder === '' || target.startsWith(`${folder}/`), `${locale}: ${target}`).toBe(true);
      }
    }
  },
};

export function describePluginContract(plugin: PluginModule, options: PluginContractOptions): void {
  describe('plugin contract', () => {
    const [first] = options.fixtures;
    if (first === undefined) throw new Error('describePluginContract needs at least one fixture');
    const firstSubject: FixtureUnderTest = { fixture: first, files: () => openFixture(first.root) };

    for (const [name, check] of Object.entries(pluginChecks)) {
      it(name, () => check(plugin, options, firstSubject));
    }
    for (const fixture of options.fixtures) {
      describe(`fixture "${fixture.name}"`, () => {
        const subject: FixtureUnderTest = { fixture, files: () => openFixture(fixture.root) };
        for (const [name, check] of Object.entries(fixtureChecks)) {
          it(name, () => check(plugin, subject));
        }
      });
    }
  });
}
