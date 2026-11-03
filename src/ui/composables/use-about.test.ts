// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { about, error, fakeClient } from '../test-support';
import { useAbout } from './use-about';

describe('useAbout', () => {
  it('loads About once', async () => {
    const { client, calls } = fakeClient();
    const state = useAbout(client);
    await state.load();
    await state.load();
    expect(state.about.value).toEqual(about);
    expect(state.error.value).toBeNull();
    expect(calls).toEqual(['getAbout']);
  });

  it('keeps the error, and asks again next time', async () => {
    const failed = error('internal.unexpected');
    const { client, calls } = fakeClient({ about: { ok: false, error: failed } });
    const state = useAbout(client);
    await state.load();
    expect(state.about.value).toBeNull();
    expect(state.error.value).toEqual(failed);
    await state.load();
    expect(calls).toEqual(['getAbout', 'getAbout']);
  });

  it('treats a failed transport as unexpected', async () => {
    const { client } = fakeClient();
    const state = useAbout({ ...client, getAbout: () => Promise.reject(new Error('gone')) });
    await state.load();
    expect(state.error.value).toEqual({ code: 'internal.unexpected', params: {}, details: [] });
  });
});
