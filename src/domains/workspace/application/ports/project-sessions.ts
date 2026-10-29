// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  GuardedDocumentLayout,
  ProjectFiles,
  RegisteredDocumentFormat,
} from '#domains/formats';
import type { LanguageCatalog, Locale } from '#domains/locale';
import type { ProjectConfig } from '../../domain/project-config.ts';
import type { ProjectId } from '../../domain/project-id.ts';
import type { ProjectWriter } from './project-writer.ts';

/** A project that's open in this app session. Lives in the main process only. */
export interface OpenedProject {
  readonly name: string;
  /** The project folder's lasting identity (`OpenedFolder.location`). Never sent to the renderer. */
  readonly location: string;
  readonly files: ProjectFiles;
  readonly writer: ProjectWriter;
  readonly config: ProjectConfig;
  readonly sourceLocale: Locale;
  /** `null` until the user chooses a target language. */
  readonly targetLocale: Locale | null;
  /** The bundled catalog with this project's own languages (config and locale folders) added. */
  readonly catalog: LanguageCatalog;
  readonly documentFormat: RegisteredDocumentFormat;
  readonly layout: GuardedDocumentLayout;
}

/** The projects open in this session, by opaque id. Behavior: `describeProjectSessionsContract`. */
export interface ProjectSessions {
  /** Stores a project and returns a new, unique id for it. */
  add(project: OpenedProject): ProjectId;
  get(id: string): OpenedProject | undefined;
  /** Replaces a stored project; `false` (and nothing stored) for an id it didn't hand out. */
  update(id: string, project: OpenedProject): boolean;
}
