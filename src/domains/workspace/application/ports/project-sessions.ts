// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  GuardedDocumentLayout,
  ProjectFiles,
  RegisteredDocumentFormat,
} from '#domains/formats';
import type { Locale } from '#domains/locale';
import type { ProjectConfig } from '../../domain/project-config.ts';
import type { ProjectId } from '../../domain/project-id.ts';

/** A project that's open in this app session. Lives in the main process only. */
export interface OpenedProject {
  readonly name: string;
  readonly files: ProjectFiles;
  readonly config: ProjectConfig;
  readonly sourceLocale: Locale;
  readonly targetLocale: Locale;
  readonly documentFormat: RegisteredDocumentFormat;
  readonly layout: GuardedDocumentLayout;
}

/** The projects open in this session, by opaque id. Behavior: `describeProjectSessionsContract`. */
export interface ProjectSessions {
  /** Stores a project and returns a new, unique id for it. */
  add(project: OpenedProject): ProjectId;
  get(id: string): OpenedProject | undefined;
}
