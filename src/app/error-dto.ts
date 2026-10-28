// SPDX-License-Identifier: GPL-3.0-or-later
import type { ListSourceDocumentsError, OpenProjectError } from '#domains/workspace';
import type { ErrorDto } from '#ipc-contract';

export type AppError = OpenProjectError | ListSourceDocumentsError;

/** Turns a use-case error into the plain DTO the UI shows a message for. Exhaustive by lint. */
export function toErrorDto(error: AppError): ErrorDto {
  const dto = (params: Record<string, string> = {}, details: readonly string[] = []): ErrorDto => ({
    code: error.code,
    params,
    details,
  });
  switch (error.code) {
    case 'workspace.folder-unavailable':
      return dto({ reason: error.reason });
    case 'workspace.config-missing':
    case 'workspace.unknown-project':
      return dto();
    case 'workspace.config-unreadable':
      return dto({ file: error.cause.path, problem: error.cause.code });
    case 'workspace.config-invalid':
      return dto(
        {},
        error.problems.map((p) => `${p.field}: ${p.problem}`),
      );
    case 'workspace.unknown-document-format':
      return dto({ formatId: error.formatId });
    case 'workspace.no-document-format':
      return dto(
        {},
        error.failures.map((f) => `${f.formatId}: ${f.code}`),
      );
    case 'formats.invalid-options':
    case 'formats.unsupported-project':
    case 'formats.plugin-failed':
      return dto({ formatId: error.formatId, reason: error.reason });
    case 'formats.file-access':
      return dto({ formatId: error.formatId, file: error.cause.path, problem: error.cause.code });
  }
}
