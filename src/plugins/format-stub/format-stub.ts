// SPDX-License-Identifier: GPL-3.0-or-later
// The reference document plugin: Markdown in one folder per locale, `<root>/<locale>/<key>.md`.
// Deliberately simple; it exists to prove the plugin contract and to show plugin authors the shape.
import {
  documentKey,
  err,
  localeId,
  ok,
  PROJECT_ROOT,
  projectPath,
  type Detection,
  type DocumentFormat,
  type DocumentLayout,
  type FormatContext,
  type LocaleId,
  type PluginError,
  type ProjectFiles,
  type ProjectPath,
  type Result,
  type SourceDocument,
} from '#plugin-api';

const EXTENSION = '.md';
const KNOWN_OPTIONS = ['root'];

/** `<root>/<rest>`, as a project path. */
function under(root: ProjectPath, rest: string): Result<ProjectPath, PluginError> {
  const path = projectPath(root === PROJECT_ROOT ? rest : `${root}/${rest}`);
  return path.ok
    ? path
    : err({ code: 'formats.unsupported-project', reason: `invalid path: ${rest}` });
}

function parseOptions(
  options: Readonly<Record<string, unknown>>,
): Result<ProjectPath, PluginError> {
  const unknown = Object.keys(options).filter((key) => !KNOWN_OPTIONS.includes(key));
  if (unknown.length > 0) {
    return err({
      code: 'formats.invalid-options',
      reason: `unknown option(s): ${unknown.join(', ')}`,
    });
  }
  const root = options.root ?? '';
  if (typeof root !== 'string')
    return err({ code: 'formats.invalid-options', reason: '"root" must be a string' });
  const path = projectPath(root);
  return path.ok
    ? path
    : err({
        code: 'formats.invalid-options',
        reason: '"root" must be a folder inside the project',
      });
}

/**
 * A folder named like a locale (`en`, `pt-BR`; a 2–3 letter language, since longer language codes
 * look like ordinary folder names such as `guide`) holding Markdown files looks like ours.
 */
function looksLikeLocaleFolder(name: string): boolean {
  return localeId(name).ok && /^[a-z]{2,3}(?:-|$)/i.test(name);
}

async function detect(files: ProjectFiles): Promise<Detection> {
  const listed = await files.list(PROJECT_ROOT, { extensions: [EXTENSION] });
  if (!listed.ok) return { matches: false };
  const evidence = listed.value.filter((path) => {
    const [first, ...rest] = path.split('/');
    return rest.length > 0 && first !== undefined && looksLikeLocaleFolder(first);
  });
  return evidence.length === 0
    ? { matches: false }
    : { matches: true, confidence: 'fallback', evidence: evidence.slice(0, 3) };
}

async function open(context: FormatContext): Promise<Result<DocumentLayout, PluginError>> {
  const root = parseOptions(context.options);
  if (!root.ok) return root;
  const sourceFolder = under(root.value, context.sourceLocale);
  if (!sourceFolder.ok) return sourceFolder;
  if (!(await context.files.exists(sourceFolder.value))) {
    return err({
      code: 'formats.unsupported-project',
      reason: `no "${sourceFolder.value}" folder`,
    });
  }
  return ok(createLayout(context.files, root.value, sourceFolder.value, context.sourceLocale));
}

function createLayout(
  files: ProjectFiles,
  root: ProjectPath,
  sourceFolder: ProjectPath,
  sourceLocale: LocaleId,
): DocumentLayout {
  return {
    declaredLocales: [],

    async listSourceDocuments() {
      const listed = await files.list(sourceFolder, { extensions: [EXTENSION] });
      if (!listed.ok) return err({ code: 'formats.file-access', cause: listed.error });
      const documents: SourceDocument[] = [];
      for (const path of listed.value) {
        const key = documentKey(path.slice(sourceFolder.length + 1, -EXTENSION.length));
        if (!key.ok)
          return err({ code: 'formats.unsupported-project', reason: `bad file name: ${path}` });
        documents.push({ key: key.value, path, locale: sourceLocale });
      }
      return ok(documents);
    },

    targetPathFor(document, target) {
      return under(root, `${target}/${document.key}${EXTENSION}`);
    },
  };
}

export const formatStub: DocumentFormat = { kind: 'document', detect, open };
