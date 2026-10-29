// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  ChooseTargetLocaleError,
  DraftError,
  ListSourceDocumentsError,
  OpenProjectError,
  ReadDocumentPairError,
  SaveDocumentError,
  TargetLanguagesError,
} from '#domains/workspace';
import type { ErrorDto } from '#ipc-contract';

export type AppError =
  | OpenProjectError
  | ListSourceDocumentsError
  | ReadDocumentPairError
  | TargetLanguagesError
  | ChooseTargetLocaleError
  | SaveDocumentError
  | DraftError;

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
    case 'workspace.no-target-locale':
    case 'workspace.draft-unwritable':
      return dto();
    case 'workspace.unknown-language':
    case 'workspace.target-is-source':
      return dto({ language: error.language });
    case 'workspace.config-unreadable':
    case 'workspace.config-unwritable':
      return dto({ file: error.cause.path, problem: error.cause.code });
    case 'workspace.config-invalid':
      return dto(
        {},
        error.problems.map((p) => `${p.field}: ${p.problem}`),
      );
    case 'workspace.unknown-document':
      return dto({ key: error.key });
    case 'workspace.document-unreadable':
    case 'workspace.document-unwritable':
      return dto({ file: error.cause.path, problem: error.cause.code });
    case 'workspace.document-changed':
      return dto({ file: error.path });
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
