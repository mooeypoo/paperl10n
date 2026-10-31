// SPDX-License-Identifier: GPL-3.0-or-later
// The plugin contract kit: the invariants every plugin must hold, checked the same way for all
// of them. A plugin's test file calls `describePluginContract(plugin, …)` once. Exposed to plugins
// as `#plugin-api/testing`. Each invariant is a named check, so the kit itself is tested against
// deliberately broken plugins (plugin-contract.test.ts). Document plugins get the document checks,
// catalog plugins the catalog checks.
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageKey, type MessageKey } from '#domains/catalog';
import { localeId, type LocaleId } from '#kernel/locale-id';
import type { ProjectPath } from '#kernel/project-path';
import type { Result } from '#kernel/result';
import { openNodeProjectFiles } from '../adapters/node-project-files.ts';
import {
  createFormatRegistry,
  type GuardedCatalogLayout,
  type GuardedDocumentLayout,
  type RegisteredCatalogFormat,
  type RegisteredDocumentFormat,
  type RegisteredFormat,
} from '../application/format-registry.ts';
import type {
  MessageChange,
  ParsedCatalog,
  PlaceholderToken,
  SourceCatalog,
} from '../application/ports/catalog-format.ts';
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
  /** Locales to check `targetPathFor` with (besides those the layout lists). */
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

function registered(plugin: PluginModule): RegisteredFormat {
  const registry = createFormatRegistry([plugin], { apiVersion: 3 });
  if (!registry.ok) expect.fail(`registration failed: ${JSON.stringify(registry.error)}`);
  const [format] = [...registry.value.documentFormats, ...registry.value.catalogFormats];
  if (format === undefined) expect.fail('registration returned no plugin');
  return format;
}

function registeredDocument(plugin: PluginModule): RegisteredDocumentFormat {
  const format = registered(plugin);
  if (format.kind !== 'document') expect.fail('not a document plugin');
  return format;
}

function registeredCatalog(plugin: PluginModule): RegisteredCatalogFormat {
  const format = registered(plugin);
  if (format.kind !== 'catalog') expect.fail('not a catalog plugin');
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
    await registeredDocument(plugin).open({
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

/** Opens a catalog plugin's layout for a fixture. */
async function openCatalogLayout(
  plugin: PluginModule,
  subject: FixtureUnderTest,
): Promise<GuardedCatalogLayout> {
  return expectOk(
    await registeredCatalog(plugin).open({
      files: await subject.files(),
      sourceLocale: parseLocale(subject.fixture.sourceLocale),
      options: subject.fixture.options ?? {},
    }),
    'open',
  );
}

/** A check run against one fixture. Throws (an assertion error) when violated. */
export type FixtureCheck = (plugin: PluginModule, subject: FixtureUnderTest) => Promise<void>;

/** Checks run against each fixture, for plugins of either kind. */
export const fixtureChecks: Readonly<Record<string, FixtureCheck>> = {
  'detection matches the expectation, the same way every time': async (plugin, subject) => {
    const files = await subject.files();
    const first = expectOk(await registered(plugin).detect(files), 'detect');
    const second = expectOk(await registered(plugin).detect(files), 'detect');
    expect(second).toEqual(first);
    expect(first.matches).toBe(subject.fixture.detected);
  },
};

/** Checks run against each fixture of a document plugin. */
export const documentFixtureChecks: Readonly<Record<string, FixtureCheck>> = {
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

// Catalog checks

/** What the edit checks write into messages: characters that need escaping in most formats. */
const SAMPLE_TEXT = 'A "quoted" \\ backslash, a new\nline, a\ttab, עברית, and $1';

/** Texts that scanners must survive: unbalanced syntax, nesting, surrogates, other systems'. */
const SCAN_SAMPLES: readonly string[] = [
  '',
  'plain text',
  '$',
  '$1$2 $10',
  '{{',
  '}}',
  '{{PLURAL:$1|',
  '{{PLURAL:$1|one|$1 items}}',
  '{{PLURAL:$1|{{GENDER:$2|he|she}} has one|many}}',
  '{{GENDER:|he|she}}',
  '{{SITENAME}} {{int:ok}}',
  '[[',
  ']]',
  '[[a|b',
  '[[Page|{{PLURAL:$1|a|b}}]] [https://example.org text]',
  '<',
  '<b',
  '<b>bold</b> <br/> <a href="x">$1</a>',
  '%s %1$s %d {name} {0} %',
  '\uD800 lone surrogate $1',
  'emoji 🦁 $1 🦁',
  'עברית $1 {{PLURAL:$1|אחד|$1 רבים}}',
];

/** Texts no catalog format accepts as a whole file without saying something. */
const MALFORMED_SAMPLES: readonly string[] = [
  '{',
  '}',
  '{"a":',
  '[1, 2',
  '\u0000',
  'msgid "',
  '\uD800',
  '=',
];

function keyOf(raw: string): MessageKey {
  const key = messageKey(raw);
  if (!key.ok) throw new Error(`kit: invalid message key ${raw}`);
  return key.value;
}

/** Problems with a scan's tokens (empty when they're valid). */
export function placeholderProblems(text: string, tokens: readonly PlaceholderToken[]): string[] {
  const problems: string[] = [];
  tokens.forEach((token, index) => {
    const at = `token ${String(index)} (${JSON.stringify(token.text)})`;
    if (!(token.start >= 0 && token.start < token.end && token.end <= text.length)) {
      problems.push(
        `${at}: range ${String(token.start)}–${String(token.end)} isn't inside the text`,
      );
    } else if (text.slice(token.start, token.end) !== token.text) {
      problems.push(`${at}: text isn't the text at its range`);
    }
    if (token.kind === 'link' && token.target === '') problems.push(`${at}: link has no target`);
    if (token.kind === 'tag' && (token.name === '' || token.name !== token.name.toLowerCase())) {
      problems.push(`${at}: tag name "${token.name}" isn't a lowercase name`);
    }
    const previous = tokens[index - 1];
    if (previous === undefined) return;
    if (previous.start === token.start && previous.end === token.end) {
      problems.push(`${at}: the same range as the token before it`);
    } else if (
      previous.start > token.start ||
      (previous.start === token.start && previous.end < token.end)
    ) {
      problems.push(`${at}: out of order (by start, an enclosing token first)`);
    }
    for (const other of tokens.slice(0, index)) {
      const apart = other.end <= token.start || token.end <= other.start;
      const nested =
        (other.start <= token.start && token.end <= other.end) ||
        (token.start <= other.start && other.end <= token.end);
      if (!apart && !nested) problems.push(`${at}: partly overlaps "${other.text}"`);
    }
  });
  return problems;
}

/** One existing file of a catalog, read and parsed. */
interface CatalogFile {
  readonly path: ProjectPath;
  readonly parsed: ParsedCatalog;
  readonly documentation: boolean;
}

interface ReadCatalog {
  readonly catalog: SourceCatalog;
  readonly source: ParsedCatalog;
  /** The source's file first, then each listed locale's that exists, then the documentation. */
  readonly files: readonly CatalogFile[];
}

async function readCatalogs(
  plugin: PluginModule,
  subject: FixtureUnderTest,
): Promise<{ format: RegisteredCatalogFormat; catalogs: readonly ReadCatalog[] }> {
  const files = await subject.files();
  const format = registeredCatalog(plugin);
  const layout = await openCatalogLayout(plugin, {
    ...subject,
    files: () => Promise.resolve(files),
  });
  const read = async (path: ProjectPath, documentation: boolean): Promise<CatalogFile> => {
    const text = await files.readText(path);
    if (!text.ok) expect.fail(`reading ${path} failed: ${JSON.stringify(text.error)}`);
    return { path, parsed: expectOk(format.parse(text.value), `parse ${path}`), documentation };
  };
  const catalogs: ReadCatalog[] = [];
  for (const catalog of expectOk(await layout.listCatalogs(), 'listCatalogs')) {
    const source = await read(catalog.path, false);
    const others: CatalogFile[] = [];
    for (const locale of layout.locales) {
      const path = expectOk(layout.targetPathFor(catalog, locale), 'targetPathFor');
      if (path !== catalog.path && (await files.exists(path))) others.push(await read(path, false));
    }
    if (catalog.documentation !== undefined) others.push(await read(catalog.documentation, true));
    catalogs.push({ catalog, source: source.parsed, files: [source, ...others] });
  }
  return { format, catalogs };
}

/** Each locale's file of each catalog (not the documentation), with its catalog's source. */
async function editableFiles(
  plugin: PluginModule,
  subject: FixtureUnderTest,
): Promise<{
  format: RegisteredCatalogFormat;
  files: readonly (CatalogFile & { readonly source: ParsedCatalog })[];
}> {
  const { format, catalogs } = await readCatalogs(plugin, subject);
  const files = catalogs.flatMap(({ source, files }) =>
    files.filter((file) => !file.documentation).map((file) => ({ ...file, source })),
  );
  return { format, files };
}

function firstAndLast<T>(items: readonly T[]): T[] {
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return [];
  return first === last ? [first] : [first, last];
}

/** Checks run against each fixture of a catalog plugin. */
export const catalogFixtureChecks: Readonly<Record<string, FixtureCheck>> = {
  'lists catalogs in a stable order, each key once, in the source locale, with their files': async (
    plugin,
    subject,
  ) => {
    const files = await subject.files();
    const layout = await openCatalogLayout(plugin, {
      ...subject,
      files: () => Promise.resolve(files),
    });
    const catalogs = expectOk(await layout.listCatalogs(), 'listCatalogs');
    expect(expectOk(await layout.listCatalogs(), 'listCatalogs')).toEqual(catalogs);
    expect(new Set(catalogs.map((c) => c.key)).size).toBe(catalogs.length);
    const sourceLocale = parseLocale(subject.fixture.sourceLocale);
    for (const catalog of catalogs) {
      expect(catalog.locale).toBe(sourceLocale);
      for (const path of [catalog.path, catalog.documentation ?? catalog.path]) {
        expect(await files.exists(path), path).toBe(true);
      }
      expect(catalog.documentation, 'documentation is its own file').not.toBe(catalog.path);
    }
  },
  "lists the project's catalog locales once each, the source locale included": async (
    plugin,
    subject,
  ) => {
    const { locales } = await openCatalogLayout(plugin, subject);
    expect(new Set(locales).size).toBe(locales.length);
    expect(locales).toContain(parseLocale(subject.fixture.sourceLocale));
  },
  'maps each catalog to its own file for the source locale, and to distinct new files for the others':
    async (plugin, subject) => {
      const layout = await openCatalogLayout(plugin, subject);
      const catalogs = expectOk(await layout.listCatalogs(), 'listCatalogs');
      const sourceLocale = parseLocale(subject.fixture.sourceLocale);
      const targets = new Set([
        ...layout.locales,
        ...subject.fixture.targetLocales.map(parseLocale),
      ]);
      targets.delete(sourceLocale);
      const sourceFiles = new Set<string>(
        catalogs.flatMap((c) => [
          c.path,
          ...(c.documentation === undefined ? [] : [c.documentation]),
        ]),
      );
      const seen = new Set<string>();
      for (const catalog of catalogs) {
        expect(expectOk(layout.targetPathFor(catalog, sourceLocale), 'targetPathFor')).toBe(
          catalog.path,
        );
        for (const locale of targets) {
          const path = expectOk(layout.targetPathFor(catalog, locale), 'targetPathFor');
          expect(sourceFiles.has(path), `${locale}: ${path} is a source file`).toBe(false);
          expect(seen.has(path), `${locale}: ${path} is mapped twice`).toBe(false);
          seen.add(path);
        }
      }
    },
  'parses every catalog file with unique keys, and writes it back unchanged without changes':
    async (plugin, subject) => {
      const { format, catalogs } = await readCatalogs(plugin, subject);
      for (const { source, files } of catalogs) {
        for (const { path, parsed } of files) {
          const keys = parsed.messages.map((m) => m.key);
          expect(new Set(keys).size, `${path}: unique keys`).toBe(keys.length);
          const written = format.serialize({ source, target: parsed, changes: [] });
          expect(expectOk(written, `serialize ${path}`), path).toBe(parsed.text);
        }
      }
    },
  'changes only the messages it is told to, and only where they are': async (plugin, subject) => {
    const { format, files } = await editableFiles(plugin, subject);
    const absent = keyOf('paperl10n-contract-kit-absent-key');
    for (const { path, parsed, source } of files) {
      const write = (target: ParsedCatalog, changes: readonly MessageChange[]) =>
        expectOk(format.serialize({ source, target, changes }), `serialize ${path}`);
      const reparse = (text: string) =>
        expectOk(format.parse(text), `parse ${path} after a change`);
      expect(write(parsed, [{ kind: 'remove', key: absent }]), `${path}: removing nothing`).toBe(
        parsed.text,
      );
      for (const message of firstAndLast(parsed.messages)) {
        const { key, text } = message;
        const at = `${path}, ${key}`;
        expect(write(parsed, [{ kind: 'set', key, text }]), `${at}: set to the same`).toBe(
          parsed.text,
        );
        const changed = reparse(write(parsed, [{ kind: 'set', key, text: SAMPLE_TEXT }]));
        expect(changed.messages, `${at}: set`).toEqual(
          parsed.messages.map((m) => (m.key === key ? { key, text: SAMPLE_TEXT } : m)),
        );
        expect(write(changed, [{ kind: 'set', key, text }]), `${at}: set back`).toBe(parsed.text);
        const removed = reparse(write(parsed, [{ kind: 'remove', key }]));
        expect(removed.messages, `${at}: removed`).toEqual(
          parsed.messages.filter((m) => m.key !== key),
        );
      }
    }
  },
  'adds a message after the nearest one before it in the source that the file has': async (
    plugin,
    subject,
  ) => {
    const { format, files } = await editableFiles(plugin, subject);
    for (const { path, parsed, source } of files) {
      const has = new Set(parsed.messages.map((m) => m.key));
      const sourceKeys = source.messages.map((m) => m.key);
      for (const key of firstAndLast(sourceKeys.filter((k) => has.has(k)))) {
        const at = `${path}, ${key}`;
        const write = (target: ParsedCatalog, changes: readonly MessageChange[]) =>
          expectOk(format.serialize({ source, target, changes }), `serialize ${at}`);
        const without = expectOk(format.parse(write(parsed, [{ kind: 'remove', key }])), at);
        const added = expectOk(
          format.parse(write(without, [{ kind: 'set', key, text: SAMPLE_TEXT }])),
          at,
        );
        const keys = added.messages.map((m) => m.key);
        expect(
          keys.filter((k) => k !== key),
          `${at}: the others stay in order`,
        ).toEqual(without.messages.map((m) => m.key));
        const remaining = new Set(without.messages.map((m) => m.key));
        const before = sourceKeys
          .slice(0, sourceKeys.indexOf(key))
          .reverse()
          .find((k) => remaining.has(k));
        expect(keys[keys.indexOf(key) - 1], `${at}: placed after`).toBe(before);
      }
    }
  },
  'writes a new file with its messages in source order': async (plugin, subject) => {
    const { format, catalogs } = await readCatalogs(plugin, subject);
    for (const { catalog, source } of catalogs) {
      const at = `a new file for ${catalog.key}`;
      const create = (changes: readonly MessageChange[]) =>
        expectOk(
          format.parse(expectOk(format.serialize({ source, target: null, changes }), at)),
          at,
        );
      expect(create([]).messages, `${at}, with nothing`).toEqual([]);
      const translated = source.messages.map((m) => ({
        key: m.key,
        text: `${SAMPLE_TEXT} ${m.key}`,
      }));
      const changes = translated.map(({ key, text }) => ({ kind: 'set' as const, key, text }));
      expect(create(changes.reverse()).messages, at).toEqual(translated);
    }
  },
  'scans every message into tokens in order, inside the text, nested or apart, the same every time':
    async (plugin, subject) => {
      const { format, catalogs } = await readCatalogs(plugin, subject);
      const texts = [
        ...SCAN_SAMPLES,
        SAMPLE_TEXT,
        ...catalogs.flatMap((c) => c.files.flatMap((f) => f.parsed.messages.map((m) => m.text))),
      ];
      for (const text of texts) {
        const tokens = expectOk(format.scanPlaceholders(text), `scan ${JSON.stringify(text)}`);
        expect(expectOk(format.scanPlaceholders(text), 'scan')).toEqual(tokens);
        expect(placeholderProblems(text, tokens), JSON.stringify(text)).toEqual([]);
      }
    },
  'reads malformed text as formats.invalid-catalog, never a crash': (plugin) => {
    const format = registeredCatalog(plugin);
    for (const text of MALFORMED_SAMPLES) {
      const parsed = format.parse(text);
      expect(parsed.ok ? 'ok' : parsed.error.code, JSON.stringify(text)).not.toBe(
        'formats.plugin-failed',
      );
      if (!parsed.ok) expect(parsed.error.code).toBe('formats.invalid-catalog');
    }
    return Promise.resolve();
  },
};

/** The fixture checks for a plugin of the kind its manifest declares (document by default). */
export function fixtureChecksFor(plugin: PluginModule): Readonly<Record<string, FixtureCheck>> {
  const manifest = parsePluginManifest(plugin.manifest);
  const kind = manifest.ok ? manifest.value.kind : 'document';
  return {
    ...fixtureChecks,
    ...(kind === 'catalog' ? catalogFixtureChecks : documentFixtureChecks),
  };
}

export function describePluginContract(plugin: PluginModule, options: PluginContractOptions): void {
  describe('plugin contract', () => {
    const [first] = options.fixtures;
    if (first === undefined) throw new Error('describePluginContract needs at least one fixture');
    const firstSubject: FixtureUnderTest = { fixture: first, files: () => openFixture(first.root) };

    for (const [name, check] of Object.entries(pluginChecks)) {
      it(name, () => check(plugin, options, firstSubject));
    }
    const checks = fixtureChecksFor(plugin);
    for (const fixture of options.fixtures) {
      describe(`fixture "${fixture.name}"`, () => {
        const subject: FixtureUnderTest = { fixture, files: () => openFixture(fixture.root) };
        for (const [name, check] of Object.entries(checks)) {
          it(name, () => check(plugin, subject));
        }
      });
    }
  });
}
