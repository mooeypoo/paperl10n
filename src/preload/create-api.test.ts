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

  it('sends a message’s forms and base forms only when it has them', async () => {
    const { api, sent } = recording();
    await api.checkMessage({ projectId: 'p1', catalog: 'c', key: 'k', text: 'a' });
    await api.checkMessage({
      projectId: 'p1',
      catalog: 'c',
      key: 'k',
      text: 'a',
      forms: ['a', 'b'],
    });
    const plain = { key: 'k', text: 'a', base: null, source: 'A' };
    const plural = { ...plain, forms: ['a', 'b'], baseForms: null };
    await api.saveCatalog({ projectId: 'p1', catalog: 'c', messages: [plain, plural] });
    await api.saveCatalogDraft({
      projectId: 'p1',
      catalog: 'c',
      messages: [{ ...plain, baseForms: ['x'], sneaky: 1 } as typeof plain],
    });
    expect(sent).toEqual([
      [channelFor('checkMessage'), { projectId: 'p1', catalog: 'c', key: 'k', text: 'a' }],
      [
        channelFor('checkMessage'),
        { projectId: 'p1', catalog: 'c', key: 'k', text: 'a', forms: ['a', 'b'] },
      ],
      [channelFor('saveCatalog'), { projectId: 'p1', catalog: 'c', messages: [plain, plural] }],
      [
        channelFor('saveCatalogDraft'),
        { projectId: 'p1', catalog: 'c', messages: [{ ...plain, baseForms: ['x'] }] },
      ],
    ]);
  });

  it('sends only the contract fields of a request, never extra properties', async () => {
    const { api, sent } = recording();
    const request = { projectId: 'p1', sneaky: '/etc/passwd' } as { projectId: string };
    await api.listSourceDocuments(request);
    expect(sent).toEqual([[channelFor('listSourceDocuments'), { projectId: 'p1' }]]);
  });
});
