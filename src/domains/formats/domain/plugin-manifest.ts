// SPDX-License-Identifier: GPL-3.0-or-later
import { err, ok, type Result } from '#kernel/result';
import { formatId, kindOfFormatId, type FormatId, type FormatKind } from './format-id.ts';

/** Manifest format versions this app understands. */
export const SUPPORTED_MANIFEST_VERSIONS: readonly number[] = [1];
/** Plugin API versions this app implements. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [1];

/**
 * Optional features a plugin can declare, per kind. Plugin API v1 defines none yet. A capability
 * is added here together with its interface method (e.g. `frontmatter-rules` in M1/M2).
 */
export const KNOWN_CAPABILITIES: Readonly<Record<FormatKind, readonly string[]>> = {
  document: [],
  catalog: [],
};

/**
 * What a plugin is, as data (`paperl10n-plugin.json`). Code says how it works; the manifest says
 * what it is. Validated with `parsePluginManifest`, for built-in and third-party plugins alike.
 */
export interface PluginManifest {
  readonly manifestVersion: number;
  readonly id: FormatId;
  readonly packageName: string;
  readonly kind: FormatKind;
  readonly apiVersion: number;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly license: string;
  readonly author: { readonly name: string; readonly url?: string };
  readonly builtIn: boolean;
  readonly capabilities: readonly string[];
  readonly externalDependencies: readonly string[];
}

export interface ManifestProblem {
  readonly field: string;
  readonly problem: string;
}

export interface InvalidManifest {
  readonly code: 'formats.manifest-invalid';
  /** The manifest's `id`, when it had a readable one. */
  readonly pluginId?: string;
  readonly problems: readonly ManifestProblem[];
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const HTTP_URL = /^https?:\/\/\S+$/;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Validates an untrusted manifest. Reports every problem at once. Unknown fields are dropped,
 * so newer manifests stay readable but nothing unvalidated reaches the app.
 */
export function parsePluginManifest(input: unknown): Result<PluginManifest, InvalidManifest> {
  if (!isRecord(input)) {
    return err({
      code: 'formats.manifest-invalid',
      problems: [{ field: '(manifest)', problem: 'must be a JSON object' }],
    });
  }

  const problems: ManifestProblem[] = [];
  /** Records a problem when `valid` is false; returns the value narrowed, or undefined. */
  function check<T>(
    value: unknown,
    valid: (v: unknown) => v is T,
    field: string,
    text: string,
  ): T | undefined {
    if (valid(value)) return value;
    problems.push({ field, problem: text });
    return undefined;
  }
  const isSupported =
    (versions: readonly number[]) =>
    (v: unknown): v is number =>
      typeof v === 'number' && versions.includes(v);
  const matches =
    (pattern: RegExp) =>
    (v: unknown): v is string =>
      typeof v === 'string' && pattern.test(v);
  const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
  const isKind = (v: unknown): v is FormatKind => v === 'document' || v === 'catalog';

  const manifestVersion = check(
    input.manifestVersion,
    isSupported(SUPPORTED_MANIFEST_VERSIONS),
    'manifestVersion',
    `must be one of: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}`,
  );

  const rawId = input.id;
  const parsedId = typeof rawId === 'string' ? formatId(rawId) : undefined;
  const id = parsedId?.ok === true ? parsedId.value : undefined;
  if (id === undefined) {
    problems.push({
      field: 'id',
      problem: 'must look like "format-<system>" or "catalog-<system>" (lowercase, digits, dashes)',
    });
  }

  const kind = check(input.kind, isKind, 'kind', 'must be "document" or "catalog"');
  if (kind !== undefined && id !== undefined && kindOfFormatId(id) !== kind) {
    problems.push({ field: 'kind', problem: `"${kind}" doesn't match the id prefix of "${id}"` });
  }

  const apiVersion = check(
    input.apiVersion,
    isSupported(SUPPORTED_API_VERSIONS),
    'apiVersion',
    `must be one of: ${SUPPORTED_API_VERSIONS.join(', ')}`,
  );
  const version = check(
    input.version,
    matches(SEMVER),
    'version',
    'must be a semantic version like "1.2.3"',
  );
  const displayName = check(
    input.displayName,
    nonEmptyString,
    'displayName',
    'must be a non-empty string',
  );
  const description = check(
    input.description,
    nonEmptyString,
    'description',
    'must be a non-empty string',
  );
  const license = check(
    input.license,
    nonEmptyString,
    'license',
    'must be an SPDX license expression',
  );
  const builtIn = check(input.builtIn, isBoolean, 'builtIn', 'must be true or false');

  const packageName = check(
    input.packageName,
    matches(NPM_NAME),
    'packageName',
    'must be a valid npm package name',
  );
  if (
    packageName !== undefined &&
    builtIn === true &&
    id !== undefined &&
    packageName !== `@paperl10n/${id}`
  ) {
    problems.push({
      field: 'packageName',
      problem: `must be "@paperl10n/${id}" for a built-in plugin`,
    });
  }

  let author: PluginManifest['author'] | undefined;
  const rawAuthor = input.author;
  if (!isRecord(rawAuthor) || !nonEmptyString(rawAuthor.name)) {
    problems.push({ field: 'author', problem: 'must be an object with a non-empty "name"' });
  } else if (rawAuthor.url === undefined) {
    author = { name: rawAuthor.name };
  } else if (matches(HTTP_URL)(rawAuthor.url)) {
    author = { name: rawAuthor.name, url: rawAuthor.url };
  } else {
    problems.push({ field: 'author.url', problem: 'must be an http(s) URL' });
  }

  const capabilities = check(
    input.capabilities,
    isStringArray,
    'capabilities',
    'must be an array of strings',
  );
  const known = kind === undefined ? [] : KNOWN_CAPABILITIES[kind];
  for (const capability of capabilities ?? []) {
    if (!known.includes(capability)) {
      problems.push({
        field: 'capabilities',
        problem: `"${capability}" isn't a capability of plugin API v1`,
      });
    }
  }

  const externalDependencies = check(
    input.externalDependencies,
    isStringArray,
    'externalDependencies',
    'must be an array of npm package names',
  );
  for (const name of externalDependencies ?? []) {
    if (!NPM_NAME.test(name)) {
      problems.push({
        field: 'externalDependencies',
        problem: `"${name}" isn't a valid package name`,
      });
    }
  }
  if (
    externalDependencies !== undefined &&
    new Set(externalDependencies).size !== externalDependencies.length
  ) {
    problems.push({ field: 'externalDependencies', problem: 'must not list a package twice' });
  }

  if (
    problems.length > 0 ||
    manifestVersion === undefined ||
    id === undefined ||
    kind === undefined ||
    apiVersion === undefined ||
    version === undefined ||
    displayName === undefined ||
    description === undefined ||
    license === undefined ||
    builtIn === undefined ||
    packageName === undefined ||
    author === undefined ||
    capabilities === undefined ||
    externalDependencies === undefined
  ) {
    return err({
      code: 'formats.manifest-invalid',
      ...(typeof rawId === 'string' ? { pluginId: rawId } : {}),
      problems,
    });
  }

  return ok({
    manifestVersion,
    id,
    packageName,
    kind,
    apiVersion,
    version,
    displayName,
    description,
    license,
    author,
    builtIn,
    capabilities: [...capabilities],
    externalDependencies: [...externalDependencies],
  });
}
