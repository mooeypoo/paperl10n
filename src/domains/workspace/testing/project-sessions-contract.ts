// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every ProjectSessions implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { OpenedProject, ProjectSessions } from '../application/ports/project-sessions.ts';

export function describeProjectSessionsContract(
  name: string,
  make: () => ProjectSessions,
  project: () => OpenedProject,
): void {
  describe(`ProjectSessions contract: ${name}`, () => {
    it('returns the stored project for its id', () => {
      const sessions = make();
      const stored = project();
      expect(sessions.get(sessions.add(stored))).toBe(stored);
    });

    it('gives each project a different, non-empty id', () => {
      const sessions = make();
      const ids = new Set([
        sessions.add(project()),
        sessions.add(project()),
        sessions.add(project()),
      ]);
      expect(ids.size).toBe(3);
      for (const id of ids) expect(id).not.toBe('');
    });

    it('knows nothing about ids it did not hand out', () => {
      const sessions = make();
      sessions.add(project());
      expect(sessions.get('not-an-id')).toBeUndefined();
      expect(sessions.get('')).toBeUndefined();
    });

    it('replaces a stored project, leaving the others alone', () => {
      const sessions = make();
      const first = sessions.add(project());
      const other = project();
      const second = sessions.add(other);
      const replacement = project();
      expect(sessions.update(first, replacement)).toBe(true);
      expect(sessions.get(first)).toBe(replacement);
      expect(sessions.get(second)).toBe(other);
    });

    it('updates nothing for ids it did not hand out', () => {
      const sessions = make();
      expect(sessions.update('not-an-id', project())).toBe(false);
      expect(sessions.get('not-an-id')).toBeUndefined();
    });
  });
}
