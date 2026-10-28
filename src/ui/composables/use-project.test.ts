// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { PaperLionApi, ProjectSummaryDto } from '#ipc-contract';
import { documents, error, fakeClient, summary } from '../test-support';
import { useProject } from './use-project';

describe('useProject', () => {
  it('opens a project and lists its documents', async () => {
    const { client, calls } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: true, value: documents }],
    });
    const project = useProject(client);
    await project.open();
    expect(calls).toEqual(['openProject', 'listSourceDocuments:p-1']);
    expect(project.summary.value).toEqual(summary);
    expect(project.documents.value).toEqual(documents);
    expect(project.error.value).toBeNull();
    expect(project.busy.value).toBe(false);
  });

  it('changes nothing when the folder dialog is cancelled', async () => {
    const { client } = fakeClient({
      open: [
        { ok: true, value: summary },
        { ok: true, value: null },
      ],
      list: [{ ok: true, value: documents }],
    });
    const project = useProject(client);
    await project.open();
    await project.open();
    expect(project.summary.value).toEqual(summary);
    expect(project.documents.value).toEqual(documents);
  });

  it('keeps the previous project and shows the error when opening fails', async () => {
    const failure = error('workspace.config-missing');
    const { client } = fakeClient({
      open: [
        { ok: true, value: summary },
        { ok: false, error: failure },
      ],
      list: [{ ok: true, value: documents }],
    });
    const project = useProject(client);
    await project.open();
    await project.open();
    expect(project.error.value).toEqual(failure);
    expect(project.summary.value).toEqual(summary);
  });

  it('shows a listing error', async () => {
    const failure = error('formats.plugin-failed', { formatId: 'format-x', reason: 'boom' });
    const { client } = fakeClient({
      open: [{ ok: true, value: summary }],
      list: [{ ok: false, error: failure }],
    });
    const project = useProject(client);
    await project.open();
    expect(project.error.value).toEqual(failure);
    expect(project.summary.value).toBeNull();
  });

  it('clears an old error after a successful open', async () => {
    const { client } = fakeClient({
      open: [
        { ok: false, error: error('workspace.config-missing') },
        { ok: true, value: summary },
      ],
      list: [{ ok: true, value: documents }],
    });
    const project = useProject(client);
    await project.open();
    await project.open();
    expect(project.error.value).toBeNull();
  });

  it('reports a broken transport as internal.unexpected and is no longer busy', async () => {
    const { client } = fakeClient();
    const project = useProject(client);
    await project.open();
    expect(project.error.value).toEqual(error('internal.unexpected'));
    expect(project.busy.value).toBe(false);
  });

  it('is busy while a request is in flight', async () => {
    let finish: (value: { ok: true; value: null }) => void = () => undefined;
    const client: PaperLionApi = {
      openProject: () => new Promise((resolve) => (finish = resolve)),
      listSourceDocuments: () => Promise.reject(new Error('unused')),
      readDocumentPair: () => Promise.reject(new Error('unused')),
    };
    const project = useProject(client);
    const pending = project.open();
    expect(project.busy.value).toBe(true);
    finish({ ok: true, value: null });
    await pending;
    expect(project.busy.value).toBe(false);
  });

  it('ignores the answer to an older request when a newer one has started', async () => {
    const resolvers: ((value: { ok: true; value: ProjectSummaryDto }) => void)[] = [];
    const newer = { ...summary, projectId: 'p-2', name: 'newer' };
    const client: PaperLionApi = {
      openProject: () => new Promise((resolve) => resolvers.push(resolve)),
      listSourceDocuments: () => Promise.resolve({ ok: true, value: documents }),
      readDocumentPair: () => Promise.reject(new Error('unused')),
    };
    const project = useProject(client);
    const first = project.open();
    const second = project.open();
    resolvers[1]?.({ ok: true, value: newer });
    await second;
    resolvers[0]?.({ ok: true, value: summary });
    await first;
    expect(project.summary.value?.name).toBe('newer');
  });
});
