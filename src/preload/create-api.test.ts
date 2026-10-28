// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { apiMethods, channelFor } from '#ipc-contract';
import { createApi } from './create-api.ts';

function recording() {
  const sent: unknown[][] = [];
  const api = createApi((channel, ...args) => {
    sent.push([channel, ...args]);
    return Promise.resolve({ ok: true, value: channel });
  });
  return { api, sent };
}

describe('createApi (the preload)', () => {
  it('exposes exactly the contract methods', () => {
    expect(Object.keys(recording().api).sort()).toEqual([...apiMethods].sort());
  });

  it('sends openProject on its channel, with no arguments', async () => {
    const { api, sent } = recording();
    expect(await api.openProject()).toEqual({ ok: true, value: channelFor('openProject') });
    expect(sent).toEqual([[channelFor('openProject')]]);
  });

  it('sends only the contract fields of a request, never extra properties', async () => {
    const { api, sent } = recording();
    const request = { projectId: 'p1', sneaky: '/etc/passwd' } as { projectId: string };
    await api.listSourceDocuments(request);
    expect(sent).toEqual([[channelFor('listSourceDocuments'), { projectId: 'p1' }]]);
  });
});
