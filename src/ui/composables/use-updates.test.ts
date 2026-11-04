// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, fakeClient, updateNotice } from '../test-support';
import { useUpdates } from './use-updates';

afterEach(() => {
  vi.useRealTimers();
});

describe('useUpdates', () => {
  it('asks for the status', async () => {
    const { client } = fakeClient({ updates: { automatic: true, notice: updateNotice() } });
    const updates = useUpdates(client);
    expect(updates.status.value).toBeNull();
    await updates.refresh();
    expect(updates.status.value).toEqual({ automatic: true, notice: updateNotice() });
  });

  it('keeps what it had when asking fails', async () => {
    const { client } = fakeClient({ updates: { automatic: true, notice: updateNotice() } });
    const updates = useUpdates(client);
    await updates.refresh();
    await useUpdates({
      ...client,
      getUpdateStatus: () => Promise.reject(new Error('gone')),
    }).refresh();
    const failing = useUpdates({
      ...client,
      getUpdateStatus: () => Promise.resolve({ ok: false, error: error('internal.unexpected') }),
    });
    await failing.refresh();
    expect(failing.status.value).toBeNull();
    expect(updates.status.value?.notice?.version).toBe('0.2.0');
  });

  it('hides a dismissed version at once, and tells main', async () => {
    const { client, updateCalls } = fakeClient({
      updates: { automatic: true, notice: updateNotice() },
    });
    const updates = useUpdates(client);
    await updates.refresh();
    await updates.dismiss('0.2.0');
    expect(updates.status.value).toEqual({ automatic: true, notice: null });
    expect(updateCalls).toEqual(['getUpdateStatus', 'dismissUpdate:0.2.0']);
  });

  it('checks now, showing "checking", then the answer and the status after', async () => {
    const { client, updateCalls } = fakeClient({
      updateChecks: [{ ok: true, value: { kind: 'newer', update: updateNotice() } }],
    });
    const updates = useUpdates(client);
    const asking = updates.checkNow();
    expect(updates.check.value).toBe('checking');
    await asking;
    expect(updates.check.value).toEqual({ kind: 'newer', update: updateNotice() });
    expect(updateCalls).toEqual(['checkForUpdates', 'getUpdateStatus']);
  });

  it('reports a check that could not be made as failed', async () => {
    const { client } = fakeClient({
      updateChecks: [{ ok: false, error: error('internal.unexpected') }],
    });
    const updates = useUpdates(client);
    await updates.checkNow();
    expect(updates.check.value).toEqual({ kind: 'failed' });
    const rejecting = useUpdates({ ...client, checkForUpdates: () => Promise.reject(new Error()) });
    await rejecting.checkNow();
    expect(rejecting.check.value).toEqual({ kind: 'failed' });
  });

  it('changes the setting', async () => {
    const { client, updateCalls } = fakeClient();
    const updates = useUpdates(client);
    await updates.setAutomatic(false);
    expect(updates.status.value).toEqual({ automatic: false, notice: null });
    expect(updateCalls).toEqual(['setAutomaticUpdateChecks:false']);
  });

  it('asks on start and on every interval, until stopped', async () => {
    vi.useFakeTimers();
    const { client, updateCalls } = fakeClient();
    const stop = useUpdates(client).start(1000);
    expect(updateCalls).toEqual(['getUpdateStatus']);
    await vi.advanceTimersByTimeAsync(2500);
    expect(updateCalls).toHaveLength(3);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateCalls).toHaveLength(3);
  });
});
