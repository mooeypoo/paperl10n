// SPDX-License-Identifier: GPL-3.0-or-later
// Shared fixtures for UI tests: a fake client with scripted answers.
import type {
  DocumentPairDto,
  ErrorDto,
  PaperLionApi,
  ProjectSummaryDto,
  SourceDocumentDto,
} from '#ipc-contract';
import type { Result } from '#kernel/result';

export const summary: ProjectSummaryDto = {
  projectId: 'p-1',
  name: 'basic',
  sourceLocale: { id: 'en', direction: 'ltr' },
  targetLocale: { id: 'he', direction: 'rtl' },
  documentFormat: { id: 'format-stub', displayName: 'Folder per locale (stub)' },
  warnings: [],
};

export const documents: readonly SourceDocumentDto[] = [
  {
    key: 'guide/getting-started',
    sourcePath: 'en/guide/getting-started.md',
    targetPath: 'he/guide/getting-started.md',
    targetExists: false,
  },
  { key: 'index', sourcePath: 'en/index.md', targetPath: 'he/index.md', targetExists: true },
];

export function error(
  code: ErrorDto['code'],
  params: Record<string, string> = {},
  details: string[] = [],
): ErrorDto {
  return { code, params, details };
}

type OpenAnswer = Result<ProjectSummaryDto | null, ErrorDto>;
type ListAnswer = Result<readonly SourceDocumentDto[], ErrorDto>;
type ReadAnswer = Result<DocumentPairDto, ErrorDto>;

/** A pair for a document key: the source as given, the translation if `target` is a text. */
export function pairFor(
  key: string,
  source: string,
  target: string | null = null,
): DocumentPairDto {
  const doc = (path: string, text: string) => ({
    path,
    text,
    blocks:
      text.trim() === ''
        ? []
        : [{ kind: 'paragraph' as const, start: 0, end: text.trimEnd().length }],
    inline: [],
  });
  return {
    key,
    source: doc(`en/${key}.md`, source),
    target: target === null ? null : doc(`he/${key}.md`, target),
  };
}

/** A client whose answers are queued up front; it records what it was asked. */
export function fakeClient(
  answers: {
    open?: OpenAnswer[];
    list?: ListAnswer[];
    /** Answers by document key; a key without one gets a plain pair. */
    read?: Readonly<Record<string, ReadAnswer>>;
  } = {},
) {
  const open = [...(answers.open ?? [])];
  const list = [...(answers.list ?? [])];
  const calls: string[] = [];
  const client: PaperLionApi = {
    openProject: () => {
      calls.push('openProject');
      const next = open.shift();
      return next === undefined
        ? Promise.reject(new Error('no scripted answer'))
        : Promise.resolve(next);
    },
    listSourceDocuments: ({ projectId }) => {
      calls.push(`listSourceDocuments:${projectId}`);
      const next = list.shift();
      return next === undefined
        ? Promise.reject(new Error('no scripted answer'))
        : Promise.resolve(next);
    },
    readDocumentPair: ({ projectId, key }) => {
      calls.push(`readDocumentPair:${projectId}:${key}`);
      return Promise.resolve(
        answers.read?.[key] ?? { ok: true, value: pairFor(key, `Source of ${key}\n`) },
      );
    },
    suggestTargetLanguages: ({ projectId }) => {
      calls.push(`suggestTargetLanguages:${projectId}`);
      return Promise.resolve({ ok: true, value: { inProject: [], recent: [], suggested: [] } });
    },
    searchTargetLanguages: ({ projectId, query }) => {
      calls.push(`searchTargetLanguages:${projectId}:${query}`);
      return Promise.resolve({ ok: true, value: [] });
    },
    chooseTargetLocale: ({ projectId, language }) => {
      calls.push(`chooseTargetLocale:${projectId}:${language}`);
      return Promise.resolve({ ok: true, value: { id: language, direction: 'ltr' } });
    },
  };
  return { client, calls };
}
