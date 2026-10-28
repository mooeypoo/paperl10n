// SPDX-License-Identifier: GPL-3.0-or-later
import type { OpenedProject, ProjectSessions } from '../application/ports/project-sessions.ts';
import type { ProjectId } from '../domain/project-id.ts';

/** Open projects held in memory for the app's lifetime. Ids are random, so they can't be guessed. */
export class InMemoryProjectSessions implements ProjectSessions {
  readonly #projects = new Map<string, OpenedProject>();
  readonly #newId: () => string;

  constructor(newId: () => string = () => crypto.randomUUID()) {
    this.#newId = newId;
  }

  add(project: OpenedProject): ProjectId {
    let id = this.#newId();
    while (this.#projects.has(id)) id = this.#newId();
    this.#projects.set(id, project);
    return id as ProjectId;
  }

  get(id: string): OpenedProject | undefined {
    return this.#projects.get(id);
  }
}
