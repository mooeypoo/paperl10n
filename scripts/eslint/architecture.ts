// SPDX-License-Identifier: GPL-3.0-or-later
// The architecture rules from AGENTS.md, as ESLint config. Policies are generated from the domain
// graph, so every allowed edge is explicit. See docs/adr/0003-boundary-enforcement.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Linter } from 'eslint';
import boundaries from 'eslint-plugin-boundaries';
import type { DependenciesPolicy } from 'eslint-plugin-boundaries';
import { domainGraph, domainNames, type DomainName } from '../domain-graph.ts';
import { noRelativeCrossUnitImports } from './no-relative-cross-unit-imports.ts';

type FileCategory = 'domain' | 'application' | 'adapters' | 'testing' | 'entry';

const elements = [
  { type: 'kernel', pattern: 'src/shared/kernel', partialMatch: false },
  { type: 'domain', pattern: 'src/domains/*', capture: ['domain'], partialMatch: false },
  { type: 'plugin', pattern: 'src/plugins/*', capture: ['plugin'], partialMatch: false },
  { type: 'app', pattern: 'src/app', partialMatch: false },
  { type: 'main', pattern: 'src/main', partialMatch: false },
  { type: 'preload', pattern: 'src/preload', partialMatch: false },
  { type: 'ui', pattern: 'src/ui', partialMatch: false },
];

const files = [
  { category: 'domain', pattern: 'src/domains/*/domain/**' },
  { category: 'application', pattern: 'src/domains/*/application/**' },
  { category: 'adapters', pattern: 'src/domains/*/adapters/**' },
  { category: 'testing', pattern: 'src/domains/*/testing/**' },
  { category: 'entry', pattern: 'src/domains/*/index.ts' },
  { category: 'plugin-entry', pattern: 'src/plugins/*/index.ts' },
  { category: 'plugin-api', pattern: 'src/domains/formats/plugin-api.ts' },
  { category: 'plugin-api-testing', pattern: 'src/domains/formats/plugin-api-testing.ts' },
  { category: 'test', pattern: '**/*.test.ts' },
];

const kernel = { element: { type: 'kernel' } };
const anyExternal = { module: { origin: ['external', 'core'] } };

function inDomain(domain: DomainName | '*', categories?: readonly FileCategory[]) {
  const element = { type: 'domain', captured: { domain } };
  return categories === undefined
    ? { element }
    : { element, file: { categories: [...categories] } };
}

/** Policies for one domain, following AGENTS.md dependency rules 1–3. */
function domainPolicies(domain: DomainName): DependenciesPolicy[] {
  // Another domain is reachable only along a declared edge, and only through its index.ts.
  const otherDomains = domainGraph[domain].map((other) => inDomain(other, ['entry']));
  return [
    {
      from: inDomain(domain, ['domain']),
      allow: { to: [inDomain(domain, ['domain']), kernel] },
    },
    {
      from: inDomain(domain, ['application']),
      allow: { to: [inDomain(domain, ['domain', 'application']), kernel, ...otherDomains] },
    },
    {
      from: inDomain(domain, ['entry']),
      allow: { to: [inDomain(domain, ['domain', 'application']), kernel] },
    },
    {
      from: inDomain(domain, ['adapters']),
      allow: { to: [inDomain(domain), kernel, ...otherDomains, anyExternal] },
    },
    // Test support may also compose the test support of domains it depends on (fakes built on
    // fakes). Production code never imports any testing/ folder.
    {
      from: inDomain(domain, ['testing']),
      allow: {
        to: [
          inDomain(domain),
          kernel,
          ...otherDomains,
          ...domainGraph[domain].map((other) => inDomain(other, ['testing'])),
          anyExternal,
        ],
      },
    },
  ];
}

// The plugin API (`#plugin-api`) re-exports the contracts plugins need: `formats`' own layers, the
// kernel, and the entry points of the domains `formats` depends on. Its testing sibling may also
// use `formats`' test support and Vitest.
const pluginApiPolicies: DependenciesPolicy[] = [
  {
    from: { file: { categories: 'plugin-api' } },
    allow: {
      to: [
        inDomain('formats', ['domain', 'application']),
        kernel,
        ...domainGraph.formats.map((other) => inDomain(other, ['entry'])),
      ],
    },
  },
  {
    from: { file: { categories: 'plugin-api-testing' } },
    allow: { to: [inDomain('formats', ['testing']), kernel, anyExternal] },
  },
];

/** A plugin folder and the npm packages its manifest allows it to import. */
export interface PluginDependencies {
  readonly plugin: string;
  readonly externalDependencies: readonly string[];
}

/** Reads every plugin's manifest. A missing or malformed list means no external dependencies;
 * the manifest itself is validated by the plugin contract kit. */
export function readPluginDependencies(pluginsFolder: URL): PluginDependencies[] {
  if (!existsSync(pluginsFolder)) return [];
  return readdirSync(pluginsFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestFile = new URL(`${entry.name}/paperl10n-plugin.json`, pluginsFolder);
      let declared: unknown = [];
      if (existsSync(manifestFile)) {
        const manifest: unknown = JSON.parse(readFileSync(manifestFile, 'utf8'));
        if (
          typeof manifest === 'object' &&
          manifest !== null &&
          'externalDependencies' in manifest
        ) {
          declared = manifest.externalDependencies;
        }
      }
      const externalDependencies = Array.isArray(declared)
        ? declared.filter((name): name is string => typeof name === 'string')
        : [];
      return { plugin: entry.name, externalDependencies };
    });
}

/**
 * A plugin imports only its own files, `#plugin-api`, and the npm packages its manifest declares.
 * Its tests may also use `#plugin-api/testing` and Vitest. Nothing else: no other plugins, no
 * domains, no kernel, no Node. That's what keeps a plugin folder extractable (ADR 0005).
 */
export function pluginPolicies({
  plugin,
  externalDependencies,
}: PluginDependencies): DependenciesPolicy[] {
  const self = { element: { type: 'plugin', captured: { plugin } } };
  const declared = externalDependencies.map((source) => ({ module: { source } }));
  const pluginApi = { file: { categories: 'plugin-api' } };
  return [
    { from: self, allow: { to: [self, pluginApi, ...declared] } },
    {
      from: { ...self, file: { categories: 'test' } },
      allow: {
        to: [
          self,
          pluginApi,
          { file: { categories: 'plugin-api-testing' } },
          { module: { source: 'vitest' } },
          ...declared,
        ],
      },
    },
  ];
}

function policiesFor(plugins: readonly PluginDependencies[]): DependenciesPolicy[] {
  return [
    { from: kernel, allow: { to: kernel } },
    ...domainNames.flatMap(domainPolicies),
    ...pluginApiPolicies,
    ...plugins.flatMap(pluginPolicies),
    // The composition root wires domains (through their index.ts, plus adapters directly) and
    // plugins (through their index.ts). Not the UI or the Electron entry points.
    {
      from: { element: { type: 'app' } },
      allow: {
        to: [
          kernel,
          inDomain('*', ['entry', 'adapters']),
          { element: { type: 'plugin' }, file: { categories: 'plugin-entry' } },
          { element: { type: 'app' } },
          anyExternal,
        ],
      },
    },
    {
      from: { element: { type: 'main' } },
      allow: { to: [kernel, { element: { type: ['app', 'main'] } }, anyExternal] },
    },
    {
      from: { element: { type: 'preload' } },
      allow: { to: [{ element: { type: 'preload' } }, { module: { source: 'electron' } }] },
    },
    {
      from: { element: { type: 'ui' } },
      allow: { to: [kernel, { element: { type: 'ui' } }, anyExternal] },
    },
    // Tests may import anything: they exercise internals on purpose. Except plugin tests, which are
    // limited like their plugin (above), so a plugin's tests travel with it when it's extracted.
    {
      from: { element: { type: '!plugin' }, file: { categories: 'test' } },
      allow: { to: [{ element: { type: '*' } }, anyExternal] },
    },
  ];
}

// One object, so configs built more than once (tests) register the same plugin, which ESLint requires.
const localPlugin = { rules: { 'no-relative-cross-unit-imports': noRelativeCrossUnitImports } };

/** The architecture config for a given set of plugins (tests pass their own). */
export function buildArchitectureConfig(plugins: readonly PluginDependencies[]): Linter.Config[] {
  return [
    {
      files: ['src/**/*.ts', 'src/**/*.vue'],
      plugins: {
        boundaries,
        paperl10n: localPlugin,
      },
      settings: {
        'boundaries/elements': elements,
        'boundaries/files': files,
        'boundaries/legacy-templates': false,
        'import/resolver': { typescript: { alwaysTryTypes: true } },
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            checkAllOrigins: true,
            checkInternals: true,
            message:
              'This import breaks the architecture rules in AGENTS.md ("Dependency rules"). Pure layers (kernel, domain/, application/, index.ts) use no libraries or I/O, domains import other domains only through their index.ts (#domains/<name>) along edges in scripts/domain-graph.ts, and only adapters/app/main/ui reach Node, Electron, or npm packages.',
            policies: policiesFor(plugins),
          },
        ],
        // A file outside every element: a new area under src/ needs an ADR and an entry above.
        'boundaries/no-unknown-files': 'error',
        'paperl10n/no-relative-cross-unit-imports': 'error',
      },
    },
  ];
}

export const architectureConfig: Linter.Config[] = buildArchitectureConfig(
  readPluginDependencies(new URL('../../src/plugins/', import.meta.url)),
);
