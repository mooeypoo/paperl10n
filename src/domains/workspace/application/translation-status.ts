// SPDX-License-Identifier: GPL-3.0-or-later
// The project's status files (docs/domains/translation.md): one per target language, at
// `.paperl10n/status/<locale>.json`, committed with the translations. Read and written through
// the project's own files and writer, like the config: atomically, and only inside the project.
import type { FileAccessError } from '#domains/formats';
import type { ParsedDocument } from '#domains/document';
import {
  emptyStatusFile,
  pageStatus,
  parseStatusFile,
  sectionFingerprints,
  sectionStatuses,
  type PageStatus,
  type SectionStatus,
  type StatusFile,
} from '#domains/translation';
import type { LocaleId } from '#kernel/locale-id';
import { projectPath, type ProjectPath } from '#kernel/project-path';
import { err, ok, type Result } from '#kernel/result';
import type { OpenedProject } from './ports/project-sessions.ts';

/** Where a target language's status file lives in the project. */
export function statusFilePath(locale: LocaleId): ProjectPath {
  const path = projectPath(`.paperl10n/status/${locale}.json`);
  // A locale id has no `/`, `..`, or control characters.
  if (!path.ok) throw new Error(`no status file path for "${locale}"`);
  return path.value;
}

export type StatusReadError =
  | { readonly code: 'workspace.status-unreadable'; readonly cause: FileAccessError }
  | {
      readonly code: 'workspace.status-invalid';
      readonly path: ProjectPath;
      readonly problem: string;
    }
  /** Written by a newer Paper Lion: read as empty, never written. */
  | {
      readonly code: 'workspace.status-unsupported';
      readonly path: ProjectPath;
      readonly version: number;
    };

export interface ReadStatus {
  readonly file: StatusFile;
  /** `false`: the language has no status file yet (nothing was ever marked up to date). */
  readonly exists: boolean;
}

/** Reads a target language's status file. A missing file is an empty status, not an error. */
export async function readStatusFile(
  project: OpenedProject,
  locale: LocaleId,
): Promise<Result<ReadStatus, StatusReadError>> {
  const path = statusFilePath(locale);
  const text = await project.files.readText(path);
  if (!text.ok) {
    return text.error.code === 'files.not-found'
      ? ok({ file: emptyStatusFile, exists: false })
      : err({ code: 'workspace.status-unreadable', cause: text.error });
  }
  const parsed = parseStatusFile(text.value);
  if (parsed.ok) return ok({ file: parsed.value, exists: true });
  return parsed.error.code === 'translation.status-file-unsupported'
    ? err({ code: 'workspace.status-unsupported', path, version: parsed.error.version })
    : err({ code: 'workspace.status-invalid', path, problem: parsed.error.problem });
}

/** A page's status, and each of its source sections' (in the order the section pairing uses). */
export interface DocumentStatus {
  readonly page: PageStatus;
  readonly sections: readonly SectionStatus[];
}

/** A page's status from its parsed source, its record in `file`, and whether it's translated. */
export function documentStatus(
  source: Pick<ParsedDocument, 'blocks' | 'text'>,
  file: StatusFile,
  key: string,
  translationExists: boolean,
): DocumentStatus {
  const current = sectionFingerprints(source);
  const record = file.pages.get(key) ?? null;
  return {
    page: pageStatus(current, record, translationExists),
    sections: sectionStatuses(current, record),
  };
}

/**
 * Runs status file changes one at a time per file, so two marks made at once can't both read the
 * old file and lose one of them. One instance serves the whole app.
 */
export interface StatusUpdates {
  /** `file`: which file (its project and path); changes to the same file wait for each other. */
  run<T>(file: string, change: () => Promise<T>): Promise<T>;
}

export function createStatusUpdates(): StatusUpdates {
  const queues = new Map<string, Promise<unknown>>();
  return {
    run(file, change) {
      const previous = queues.get(file) ?? Promise.resolve();
      const next = previous.then(change, change);
      const settled = next.then(
        () => undefined,
        () => undefined,
      );
      queues.set(file, settled);
      void settled.then(() => {
        if (queues.get(file) === settled) queues.delete(file);
      });
      return next;
    },
  };
}
