// SPDX-License-Identifier: GPL-3.0-or-later
import type { ListSourceDocuments, OpenProject } from '#domains/workspace';
import type { PaperLionApi } from '#ipc-contract';
import { err, ok } from '#kernel/result';
import { toErrorDto } from './error-dto.ts';

export interface UseCases {
  readonly openProject: OpenProject;
  readonly listSourceDocuments: ListSourceDocuments;
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
        })),
      );
    },
  };
}
