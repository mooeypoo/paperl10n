// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { OpenedProject } from '../application/ports/project-sessions.ts';
import { describeProjectSessionsContract } from '../testing/project-sessions-contract.ts';
import { InMemoryProjectSessions } from './in-memory-project-sessions.ts';

// The sessions store doesn't look inside projects, so a placeholder object is enough.
const project = () => ({ name: 'placeholder' }) as unknown as OpenedProject;

describeProjectSessionsContract(
  'InMemoryProjectSessions',
  () => new InMemoryProjectSessions(),
  project,
);

describe('InMemoryProjectSessions', () => {
  it('draws a new id when the generator repeats itself', () => {
    const ids = ['same', 'same', 'other'];
    const sessions = new InMemoryProjectSessions(() => ids.shift() ?? 'exhausted');
    expect([sessions.add(project()), sessions.add(project())]).toEqual(['same', 'other']);
  });

  it('uses random UUIDs by default', () => {
    expect(new InMemoryProjectSessions().add(project())).toMatch(/^[0-9a-f-]{36}$/);
  });
});
