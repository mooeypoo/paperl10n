// SPDX-License-Identifier: GPL-3.0-or-later
import type { ParsedDocument } from '#domains/document';
import type { Locale } from '#domains/locale';
import type { Section, SectionPairing } from '#domains/translation';
import type {
  ChooseTargetLocale,
  DiscardDraft,
  LanguageEntry,
  ListSourceDocuments,
  MarkExistingUpToDate,
  MarkUpToDate,
  OpenProject,
  ReadDocument,
  ReadDocumentPair,
  SaveDocument,
  SaveDraft,
  SearchTargetLanguages,
  SuggestTargetLanguages,
} from '#domains/workspace';
import type {
  DocumentTextDto,
  LanguageDto,
  LocaleDto,
  PaperLionApi,
  SectionPairingDto,
} from '#ipc-contract';
import { err, ok } from '#kernel/result';
import { toErrorDto } from './error-dto.ts';

export interface UseCases {
  readonly openProject: OpenProject;
  readonly listSourceDocuments: ListSourceDocuments;
  readonly readDocumentPair: ReadDocumentPair;
  readonly suggestTargetLanguages: SuggestTargetLanguages;
  readonly searchTargetLanguages: SearchTargetLanguages;
  readonly chooseTargetLocale: ChooseTargetLocale;
  readonly saveDocument: SaveDocument;
  readonly saveDraft: SaveDraft;
  readonly discardDraft: DiscardDraft;
  readonly markUpToDate: MarkUpToDate;
  readonly markExistingUpToDate: MarkExistingUpToDate;
}

function toLocaleDto(locale: Locale): LocaleDto {
  return { id: locale.id, direction: locale.direction };
}

function toLanguageDto(entry: LanguageEntry): LanguageDto {
  return { tag: entry.tag, name: entry.name, autonym: entry.autonym, direction: entry.direction };
}

function toDocumentDto({ path, mdx, document }: ReadDocument): DocumentTextDto {
  return {
    path,
    mdx,
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

function toSectionPairingDto(pairing: SectionPairing): SectionPairingDto {
  if (!pairing.paired) {
    const { reason, sourceCount, targetCount } = pairing;
    return { paired: false, reason, sourceCount, targetCount };
  }
  const range = (section: Section | null) =>
    section === null ? null : { start: section.range.start, end: section.range.end };
  return {
    paired: true,
    level: pairing.level,
    pairs: pairing.pairs.map(({ source, target }) => ({
      // A pair always has at least one side.
      kind: (source ?? target)?.kind ?? 'intro',
      source: range(source),
      target: range(target),
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
        sourceLocale: toLocaleDto(summary.sourceLocale),
        targetLocale: summary.targetLocale === null ? null : toLocaleDto(summary.targetLocale),
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
      const { documents, statusFile } = result.value;
      return ok({
        documents: documents.map((entry) => ({
          key: entry.key,
          sourcePath: entry.sourcePath,
          targetPath: entry.targetPath,
          targetExists: entry.targetExists,
          hasDraft: entry.hasDraft,
          status: entry.status,
        })),
        statusFile: {
          exists: statusFile.exists,
          problem: statusFile.problem === null ? null : toErrorDto(statusFile.problem),
        },
      });
    },

    async readDocumentPair({ projectId, key }) {
      const result = await useCases.readDocumentPair(projectId, key);
      if (!result.ok) return err(toErrorDto(result.error));
      const pair = result.value;
      return ok({
        key: pair.key,
        source: toDocumentDto(pair.source),
        target: pair.target === null ? null : toDocumentDto(pair.target),
        draft: pair.draft === null ? null : { text: pair.draft.text, base: pair.draft.base },
        sections: toSectionPairingDto(pair.sections),
        status: {
          page: pair.status.page,
          sections: [...pair.status.sections],
          sourceFingerprint: pair.status.sourceFingerprint,
        },
      });
    },

    suggestTargetLanguages({ projectId, recent, systemLanguages, uiLanguage }) {
      const result = useCases.suggestTargetLanguages(projectId, {
        recent,
        systemLanguages,
        uiLanguage,
      });
      if (!result.ok) return Promise.resolve(err(toErrorDto(result.error)));
      const { inProject, recent: recentPicks, suggested } = result.value;
      return Promise.resolve(
        ok({
          inProject: inProject.map(toLanguageDto),
          recent: recentPicks.map(toLanguageDto),
          suggested: suggested.map(toLanguageDto),
        }),
      );
    },

    searchTargetLanguages({ projectId, query, uiLanguage }) {
      const result = useCases.searchTargetLanguages(projectId, { query, uiLanguage });
      return Promise.resolve(
        result.ok ? ok(result.value.map(toLanguageDto)) : err(toErrorDto(result.error)),
      );
    },

    async saveDocument({ projectId, key, text, base }) {
      const result = await useCases.saveDocument(projectId, { key, text, base });
      if (!result.ok) return err(toErrorDto(result.error));
      return ok({ path: result.value.path, written: result.value.written });
    },

    async saveDraft({ projectId, key, text, base }) {
      const result = await useCases.saveDraft(projectId, { key, text, base });
      return result.ok ? ok(null) : err(toErrorDto(result.error));
    },

    async discardDraft({ projectId, key }) {
      const result = await useCases.discardDraft(projectId, key);
      return result.ok ? ok(null) : err(toErrorDto(result.error));
    },

    async markUpToDate({ projectId, key, sourceFingerprint, sections }) {
      const result = await useCases.markUpToDate(projectId, { key, sourceFingerprint, sections });
      if (!result.ok) return err(toErrorDto(result.error));
      return ok({ page: result.value.page, sections: [...result.value.sections] });
    },

    async markExistingUpToDate({ projectId }) {
      const result = await useCases.markExistingUpToDate(projectId);
      return result.ok ? ok({ marked: [...result.value.marked] }) : err(toErrorDto(result.error));
    },

    async chooseTargetLocale({ projectId, language }) {
      const result = await useCases.chooseTargetLocale(projectId, language);
      return result.ok ? ok(toLocaleDto(result.value)) : err(toErrorDto(result.error));
    },
  };
}
