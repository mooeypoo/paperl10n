// SPDX-License-Identifier: GPL-3.0-or-later
// Shared fixtures for UI tests: a fake client with scripted answers.
import type { ErrorDto, PaperLionApi, ProjectSummaryDto, SourceDocumentDto } from '#ipc-contract';
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
  },
  { key: 'index', sourcePath: 'en/index.md', targetPath: 'he/index.md' },
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

/** A client whose answers are queued up front; it records what it was asked. */
export function fakeClient(answers: { open?: OpenAnswer[]; list?: ListAnswer[] } = {}) {
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
  };
  return { client, calls };
}
