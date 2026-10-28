// SPDX-License-Identifier: GPL-3.0-or-later
import type { ParsedDocument } from '#domains/document';
import type {
  ListSourceDocuments,
  OpenProject,
  ReadDocument,
  ReadDocumentPair,
} from '#domains/workspace';
import type { DocumentTextDto, PaperLionApi } from '#ipc-contract';
import { err, ok } from '#kernel/result';
import { toErrorDto } from './error-dto.ts';

export interface UseCases {
  readonly openProject: OpenProject;
  readonly listSourceDocuments: ListSourceDocuments;
  readonly readDocumentPair: ReadDocumentPair;
}

function toDocumentDto({ path, document }: ReadDocument): DocumentTextDto {
  return {
    path,
    text: document.text,
    blocks: document.blocks.map(({ kind, range, depth }) =>
      depth === undefined
        ? { kind, start: range.start, end: range.end }
        : { kind, start: range.start, end: range.end, depth },
    ),
    inline: document.inline.map(({ kind, range }: ParsedDocument['inline'][number]) => ({
      kind,
      start: range.start,
      end: range.end,
    })),
  };
}

/** Implements the IPC contract on top of the use cases: domain results in, plain DTOs out. */
export function createApiHandlers(useCases: UseCases): PaperLionApi {
  return {
    async openProject() {
      const result = await useCases.openProject();
      if (!result.ok) return err(toErrorDto(result.error));
      const summary = result.value;
      if (summary === null) return ok(null);
      return ok({
        projectId: summary.projectId,
        name: summary.name,
        sourceLocale: { id: summary.sourceLocale.id, direction: summary.sourceLocale.direction },
        targetLocale: { id: summary.targetLocale.id, direction: summary.targetLocale.direction },
        documentFormat: {
          id: summary.documentFormat.id,
          displayName: summary.documentFormat.displayName,
        },
        warnings: [...summary.warnings],
      });
    },

    async listSourceDocuments({ projectId }) {
      const result = await useCases.listSourceDocuments(projectId);
      if (!result.ok) return err(toErrorDto(result.error));
      return ok(
        result.value.map((entry) => ({
          key: entry.key,
          sourcePath: entry.sourcePath,
          targetPath: entry.targetPath,
          targetExists: entry.targetExists,
        })),
      );
    },

    async readDocumentPair({ projectId, key }) {
      const result = await useCases.readDocumentPair(projectId, key);
      if (!result.ok) return err(toErrorDto(result.error));
      const pair = result.value;
      return ok({
        key: pair.key,
        source: toDocumentDto(pair.source),
        target: pair.target === null ? null : toDocumentDto(pair.target),
      });
    },
  };
}
