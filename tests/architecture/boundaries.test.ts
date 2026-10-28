// SPDX-License-Identifier: GPL-3.0-or-later
// Guards the guards: each architecture rule has a sample that must fail, and positive controls
// that must pass, so a misconfigured or upgraded plugin can't silently stop enforcing anything.
// Samples are linted as virtual files at real paths; nothing is written to src/.
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { buildArchitectureConfig } from '../../scripts/eslint/architecture.ts';

const repoRoot = new URL('../..', import.meta.url).pathname;

// Virtual files aren't part of a TypeScript project, so type-aware rules are off here.
// They have their own on-disk sample below.
const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: tseslint.configs.disableTypeChecked as Linter.Config,
});

async function ruleIdsFor(filePath: string, code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

const DEPENDENCIES = 'boundaries/dependencies';
const RELATIVE = 'paperl10n/no-relative-cross-unit-imports';
const UNKNOWN_FILE = 'boundaries/no-unknown-files';

describe('architecture rules report violations', () => {
  it.each<[string, string, string, string[]]>([
    [
      'domain layer imports Node',
      'src/domains/locale/domain/sample.ts',
      "import { readFileSync } from 'node:fs';\nexport const x = readFileSync;\n",
      [DEPENDENCIES],
    ],
    [
      'domain layer imports an npm package',
      'src/domains/locale/domain/sample.ts',
      "import ts from 'typescript';\nexport const x = ts;\n",
      [DEPENDENCIES],
    ],
    [
      'domain layer imports another domain, even along a declared edge',
      'src/domains/workspace/domain/sample.ts',
      "import * as formats from '#domains/formats';\nexport const x = formats;\n",
      [DEPENDENCIES],
    ],
    [
      'application imports a domain without a declared edge',
      'src/domains/locale/application/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
      [DEPENDENCIES],
    ],
    [
      'application imports Node',
      'src/domains/workspace/application/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'index.ts imports Node',
      'src/domains/locale/index.ts',
      "export { readFile } from 'node:fs/promises';\n",
      [DEPENDENCIES],
    ],
    [
      'kernel imports a domain',
      'src/shared/kernel/sample.ts',
      "import * as locale from '#domains/locale';\nexport const x = locale;\n",
      [DEPENDENCIES],
    ],
    [
      'relative import into another domain (even its index.ts)',
      'src/domains/workspace/application/sample.ts',
      "import * as formats from '../../formats/index.ts';\nexport const x = formats;\n",
      [RELATIVE],
    ],
    [
      'relative import into the kernel',
      'src/domains/locale/domain/sample.ts',
      "import { ok } from '../../../shared/kernel/result.ts';\nexport const x = ok;\n",
      [RELATIVE],
    ],
    [
      'ui imports a domain',
      'src/ui/sample.ts',
      "import * as locale from '#domains/locale';\nexport const x = locale;\n",
      [DEPENDENCIES],
    ],
    [
      'main imports a domain instead of going through app/',
      'src/main/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
      [DEPENDENCIES],
    ],
    [
      'preload imports Node',
      'src/preload/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'a file outside every known area',
      'src/misc/sample.ts',
      'export const x = 1;\n',
      [UNKNOWN_FILE],
    ],
    [
      "a deep import into another domain's internals",
      'src/domains/workspace/application/sample.ts',
      "import { formatId } from '../../formats/domain/format-id.ts';\nexport const x = formatId;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      "app/ reaching into a domain's internals (only index.ts and adapters)",
      'src/app/sample.ts',
      "import { parsePluginManifest } from '../domains/formats/domain/plugin-manifest.ts';\nexport const x = parsePluginManifest;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      'the plugin API re-exporting a domain formats does not depend on',
      'src/domains/formats/plugin-api.ts',
      "export { localeFrom } from '#domains/locale';\n",
      [DEPENDENCIES],
    ],
    [
      'the plugin API re-exporting Node',
      'src/domains/formats/plugin-api.ts',
      "export { readFile } from 'node:fs/promises';\n",
      [DEPENDENCIES],
    ],
    [
      'ui importing Node (the renderer is sandboxed)',
      'src/ui/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'ui importing electron (only the preload may)',
      'src/ui/sample.ts',
      "import { ipcRenderer } from 'electron';\nexport const x = ipcRenderer;\n",
      [DEPENDENCIES],
    ],
    [
      'ui importing the app wiring (it may only talk to the IPC contract)',
      'src/ui/sample.ts',
      "import { createAppApi } from '../app/create-app-api.ts';\nexport const x = createAppApi;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      'the IPC contract importing a domain (it must stay plain data)',
      'src/shared/ipc-contract/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
      [DEPENDENCIES],
    ],
    [
      'preload importing the app wiring',
      'src/preload/sample.ts',
      "import { createAppApi } from '../app/create-app-api.ts';\nexport const x = createAppApi;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      'index.ts exposing an adapter (adapters are for app/ only)',
      'src/domains/formats/index.ts',
      "export { openNodeProjectFiles } from './adapters/node-project-files.ts';\n",
      [DEPENDENCIES],
    ],
    [
      "another domain using formats' adapter",
      'src/domains/workspace/application/sample.ts',
      "import { openNodeProjectFiles } from '#adapters/formats/node-project-files';\nexport const x = openNodeProjectFiles;\n",
      [DEPENDENCIES],
    ],
    [
      "test support importing the test support of a domain it doesn't depend on",
      'src/domains/locale/testing/sample.ts',
      "import { FakeFolderPicker } from '#domain-testing/workspace';\nexport const x = FakeFolderPicker;\n",
      [DEPENDENCIES],
    ],
    [
      "production code importing a domain's test support",
      'src/domains/workspace/application/sample.ts',
      "import { InMemoryProjectFiles } from '#domain-testing/formats';\nexport const x = InMemoryProjectFiles;\n",
      [DEPENDENCIES],
    ],
    [
      'shared app/ code importing the Node composition root (app/ stays pure)',
      'src/app/sample.ts',
      "import { createElectronAppApi } from './node/composition-root.ts';\nexport const x = createElectronAppApi;\n",
      [DEPENDENCIES],
    ],
    [
      'the UI harness importing Node (it runs in a browser)',
      'src/ui-harness/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'the UI harness importing electron',
      'src/ui-harness/sample.ts',
      "import { ipcRenderer } from 'electron';\nexport const x = ipcRenderer;\n",
      [DEPENDENCIES],
    ],
    [
      'the UI harness importing the Electron composition root',
      'src/ui-harness/sample.ts',
      "import { createElectronAppApi } from '#app/node/composition-root';\nexport const x = createElectronAppApi;\n",
      [DEPENDENCIES],
    ],
    [
      'the UI harness reaching past mountApp() into the UI',
      'src/ui-harness/sample.ts',
      "import { useClient } from '../ui/client.ts';\nexport const x = useClient;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      "the UI harness importing a domain's test support (it pulls in Vitest)",
      'src/ui-harness/sample.ts',
      "import { InMemoryProjectFiles } from '#domain-testing/formats';\nexport const x = InMemoryProjectFiles;\n",
      [DEPENDENCIES],
    ],
    [
      'the UI importing the UI harness (nothing may)',
      'src/ui/sample.ts',
      "import { startHarness } from '../ui-harness/harness.ts';\nexport const x = startHarness;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      'app/ importing the UI harness (nothing may)',
      'src/app/sample.ts',
      "import { startHarness } from '../ui-harness/harness.ts';\nexport const x = startHarness;\n",
      [RELATIVE, DEPENDENCIES],
    ],
    [
      'main importing artwork from assets/ (only the UI uses it so far)',
      'src/main/sample.ts',
      "import mark from '#assets/paperl10n-mark.svg';\nexport const x = mark;\n",
      [DEPENDENCIES],
    ],
  ])('%s', async (_description, filePath, code, expected) => {
    expect(await ruleIdsFor(filePath, code)).toEqual(expected);
  });

  it('explains violations by pointing to AGENTS.md', async () => {
    const [result] = await eslint.lintText("import 'node:fs';\n", {
      filePath: `${repoRoot}src/domains/locale/domain/sample.ts`,
    });
    expect(result?.messages[0]?.message).toContain('AGENTS.md');
  });
});

describe('architecture rules allow the intended dependencies (positive controls)', () => {
  it.each<[string, string, string]>([
    [
      'application imports another domain along a declared edge',
      'src/domains/workspace/application/sample.ts',
      "import * as formats from '#domains/formats';\nexport const x = formats;\n",
    ],
    [
      'application imports the kernel',
      'src/domains/workspace/application/sample.ts',
      "import { ok } from '#kernel/result';\nexport const x = ok;\n",
    ],
    [
      'domain layer imports the kernel',
      'src/domains/locale/domain/sample.ts',
      "import { localeId } from '#kernel/locale-id';\nexport const x = localeId;\n",
    ],
    [
      'adapters import Node',
      'src/domains/formats/adapters/sample.ts',
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
    ],
    [
      'tests import Vitest, Node, and domains',
      'src/domains/locale/domain/sample.test.ts',
      "import { it } from 'vitest';\nimport { tmpdir } from 'node:os';\nimport * as formats from '#domains/formats';\nexport const x = [it, tmpdir, formats];\n",
    ],
    [
      'app imports a domain through its index.ts',
      'src/app/sample.ts',
      "import * as workspace from '#domains/workspace';\nexport const x = workspace;\n",
    ],
    [
      'the plugin API re-exports formats, document, and the kernel',
      'src/domains/formats/plugin-api.ts',
      "export type { DocumentFormat } from './application/ports/document-format.ts';\nexport { documentKey } from '#domains/document';\nexport { ok } from '#kernel/result';\n",
    ],
    [
      "a test imports another domain's test support",
      'src/domains/workspace/application/sample.test.ts',
      "import { InMemoryProjectFiles } from '#domain-testing/formats';\nexport const x = InMemoryProjectFiles;\n",
    ],
    [
      'app imports an adapter through #adapters',
      'src/app/sample.ts',
      "import { openNodeProjectFiles } from '#adapters/formats/node-project-files';\nexport const x = openNodeProjectFiles;\n",
    ],
    [
      'test support composing the test support of a domain it depends on',
      'src/domains/workspace/testing/sample.ts',
      "import { InMemoryProjectFiles } from '#domain-testing/formats';\nexport const x = InMemoryProjectFiles;\n",
    ],
    [
      'main imports the Electron composition root through #app',
      'src/main/sample.ts',
      "import { createElectronAppApi } from '#app/node/composition-root';\nexport const x = createElectronAppApi;\n",
    ],
    [
      'preload imports electron',
      'src/preload/sample.ts',
      "import { contextBridge } from 'electron';\nexport const x = contextBridge;\n",
    ],
    [
      'ui imports the IPC contract',
      'src/ui/sample.ts',
      "import { errorCodes } from '#ipc-contract';\nexport const x = errorCodes;\n",
    ],
    [
      'preload imports the IPC contract',
      'src/preload/sample.ts',
      "import { apiMethods } from '#ipc-contract';\nexport const x = apiMethods;\n",
    ],
    [
      'ui imports the kernel',
      'src/ui/sample.ts',
      "import { ok } from '#kernel/result';\nexport const x = ok;\n",
    ],
    [
      'the Node composition root imports the shared app wiring',
      'src/app/node/sample.ts',
      "import { createAppApi } from '../create-app-api.ts';\nexport const x = createAppApi;\n",
    ],
    [
      'the UI harness mounts the UI through #ui/mount',
      'src/ui-harness/sample.ts',
      "import { mountApp } from '#ui/mount';\nexport const x = mountApp;\n",
    ],
    [
      'the UI harness wires the shared app/ code and in-memory adapters',
      'src/ui-harness/sample.ts',
      "import { createAppApi } from '#app/create-app-api';\nimport { InMemoryProjectFiles } from '#adapters/formats/in-memory-project-files';\nimport type { ProjectFilesOpener } from '#domains/workspace';\nimport { apiMethods } from '#ipc-contract';\nexport const x = [createAppApi, InMemoryProjectFiles, apiMethods];\nexport type Y = ProjectFilesOpener;\n",
    ],
    [
      'ui imports the mark through #assets',
      'src/ui/sample.ts',
      "import mark from '#assets/paperl10n-mark.svg';\nexport const x = mark;\n",
    ],
  ])('%s', async (_description, filePath, code) => {
    expect(await ruleIdsFor(filePath, code)).toEqual([]);
  });
});

// Type-aware linting builds a whole TypeScript program from cold, which takes more than the default
// 5 s on CI runners as the project grows. The rules it checks are worth the wait.
describe('type-aware rules still run', () => {
  it('reports a floating promise (on-disk sample, linted with its TypeScript project)', async () => {
    const typed = new ESLint({ cwd: repoRoot, ignore: false });
    const [result] = await typed.lintFiles(['tests/architecture/samples/floating-promise.ts']);
    expect(result?.messages.map((message) => message.ruleId)).toContain(
      '@typescript-eslint/no-floating-promises',
    );
  }, 30_000);
});

describe('plugin isolation (ADR 0005)', () => {
  const plugin = 'src/plugins/format-stub';

  it.each<[string, string, string, string[]]>([
    [
      'a plugin importing a domain',
      `${plugin}/sample.ts`,
      "import * as f from '#domains/formats';\nexport const x = f;\n",
      [DEPENDENCIES],
    ],
    [
      'a plugin importing the kernel directly (use #plugin-api)',
      `${plugin}/sample.ts`,
      "import { ok } from '#kernel/result';\nexport const x = ok;\n",
      [DEPENDENCIES],
    ],
    [
      'a plugin importing Node',
      `${plugin}/sample.ts`,
      "import { readFile } from 'node:fs/promises';\nexport const x = readFile;\n",
      [DEPENDENCIES],
    ],
    [
      'a plugin importing an npm package its manifest does not declare',
      `${plugin}/sample.ts`,
      "import ts from 'typescript';\nexport const x = ts;\n",
      [DEPENDENCIES],
    ],
    [
      'a plugin importing another plugin',
      `${plugin}/sample.ts`,
      "import * as other from '../format-other/index.ts';\nexport const x = other;\n",
      [RELATIVE],
    ],
    [
      "a plugin's test importing core test support",
      `${plugin}/sample.test.ts`,
      "import { InMemoryProjectFiles } from '#domain-testing/formats';\nexport const x = InMemoryProjectFiles;\n",
      [DEPENDENCIES],
    ],
    [
      'a domain importing a plugin',
      'src/domains/workspace/application/sample.ts',
      "import { plugin } from '#plugins/format-stub';\nexport const x = plugin;\n",
      [DEPENDENCIES],
    ],
    [
      "app/ reaching past a plugin's index.ts",
      'src/app/sample.ts',
      "import { formatStub } from '../plugins/format-stub/format-stub.ts';\nexport const x = formatStub;\n",
      [RELATIVE, DEPENDENCIES],
    ],
  ])('reports %s', async (_description, filePath, code, expected) => {
    expect(await ruleIdsFor(filePath, code)).toEqual(expected);
  });

  it.each<[string, string, string]>([
    [
      'a plugin importing #plugin-api',
      `${plugin}/sample.ts`,
      "import { ok } from '#plugin-api';\nexport const x = ok;\n",
    ],
    [
      'a plugin importing its own files',
      `${plugin}/sample.ts`,
      "import { formatStub } from './format-stub.ts';\nexport const x = formatStub;\n",
    ],
    [
      "a plugin's test importing #plugin-api/testing and Vitest",
      `${plugin}/sample.test.ts`,
      "import { it } from 'vitest';\nimport { openFixture } from '#plugin-api/testing';\nexport const x = [it, openFixture];\n",
    ],
    [
      'app/ importing a plugin through #plugins',
      'src/app/sample.ts',
      "import { plugin } from '#plugins/format-stub';\nexport const x = plugin;\n",
    ],
  ])('allows %s', async (_description, filePath, code) => {
    expect(await ruleIdsFor(filePath, code)).toEqual([]);
  });

  // Only the generated architecture config plus the TypeScript parser, not eslint.config.js:
  // that file is loaded by Node, this test's imports by Vitest, so their plugin objects differ.
  async function ruleIdsWithManifest(externalDependencies: string[]): Promise<(string | null)[]> {
    const isolated = new ESLint({
      cwd: repoRoot,
      overrideConfigFile: true,
      overrideConfig: [
        { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
        ...buildArchitectureConfig([{ plugin: 'format-stub', externalDependencies }]),
      ],
    });
    const [result] = await isolated.lintText(
      "import ts from 'typescript';\nexport const x = ts;\n",
      {
        filePath: `${repoRoot}${plugin}/sample.ts`,
      },
    );
    return (result?.messages ?? []).map((message) => message.ruleId);
  }

  it('allows an npm package once the manifest declares it (and only then)', async () => {
    expect(await ruleIdsWithManifest([])).toEqual([DEPENDENCIES]);
    expect(await ruleIdsWithManifest(['typescript'])).toEqual([]);
  });
});
