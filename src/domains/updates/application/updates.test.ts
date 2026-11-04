// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { FakeUpdateSource, unavailableUpdateStateStore } from '#domain-testing/updates';
import { InMemoryUpdateStateStore } from '../adapters/in-memory-update-state-store.ts';
import { CHECK_INTERVAL_MS } from '../domain/update-state.ts';
import { createUpdates, type UpdatesDependencies } from './updates.ts';

const DAY = CHECK_INTERVAL_MS;
const release = (version: string) => {
  const page = `https://github.com/mooeypoo/paperl10n/releases/tag/v${version}`;
  return { version, date: '2026-12-01', notes: page, download: { en: page } };
};

function setup(
  overrides: Partial<UpdatesDependencies> = {},
  body: string | null = FakeUpdateSource.releaseBody('0.2.0'),
) {
  const source = new FakeUpdateSource(body);
  const store = new InMemoryUpdateStateStore();
  const clock = { now: 100 * DAY };
  const make = (more: Partial<UpdatesDependencies> = {}) =>
    createUpdates({
      source,
      store,
      currentVersion: '0.1.0',
      automaticAllowed: true,
      now: () => clock.now,
      ...overrides,
      ...more,
    });
  return { source, store, clock, make, updates: make() };
}

describe('createUpdates: the automatic check', () => {
  it('checks when due and mentions a newer version', async () => {
    const { updates, source } = setup();
    expect(await updates.status()).toEqual({ automatic: true, notice: release('0.2.0') });
    expect(source.calls).toBe(1);
  });

  it('checks at most once a day, across restarts, and again after a day', async () => {
    const { updates, source, clock, make } = setup();
    await updates.status();
    clock.now += DAY - 1;
    await updates.status();
    expect(await make().status()).toEqual({ automatic: true, notice: release('0.2.0') });
    expect(source.calls).toBe(1);
    clock.now += 1;
    await updates.status();
    expect(source.calls).toBe(2);
  });

  it('checks again when the clock went backwards', async () => {
    const { updates, source, clock } = setup();
    await updates.status();
    clock.now -= DAY;
    await updates.status();
    expect(source.calls).toBe(2);
  });

  it('mentions nothing for the same or an older version', async () => {
    expect(await setup({ currentVersion: '0.2.0' }).updates.status()).toEqual({
      automatic: true,
      notice: null,
    });
    expect(await setup({ currentVersion: '1.0.0' }).updates.status()).toEqual({
      automatic: true,
      notice: null,
    });
  });

  it('is quiet when a check fails, and tries again next time', async () => {
    const { updates, source } = setup({}, null);
    expect(await updates.status()).toEqual({ automatic: true, notice: null });
    source.body = FakeUpdateSource.releaseBody('0.2.0');
    expect(await updates.status()).toEqual({ automatic: true, notice: release('0.2.0') });
    expect(source.calls).toBe(2);
  });

  it('treats a source that throws as a failed check', async () => {
    const { updates } = setup({
      source: { latest: () => Promise.reject(new Error('boom')) },
    });
    expect(await updates.status()).toEqual({ automatic: true, notice: null });
    expect(await updates.checkNow()).toEqual({ kind: 'failed' });
  });

  it('never checks by itself where automatic checks are not allowed (development)', async () => {
    const { updates, source } = setup({ automaticAllowed: false });
    expect(await updates.status()).toEqual({ automatic: true, notice: null });
    expect(source.calls).toBe(0);
  });

  it('asks once while a check is already running', async () => {
    const { updates, source } = setup();
    const release0 = source.hold();
    const both = Promise.all([updates.status(), updates.status(), updates.checkNow()]);
    release0();
    const [first, second, asked] = await both;
    expect(first.notice?.version).toBe('0.2.0');
    expect(second.notice?.version).toBe('0.2.0');
    expect(asked).toEqual({ kind: 'newer', release: release('0.2.0') });
    expect(source.calls).toBe(1);
  });
});

describe('createUpdates: "Not now"', () => {
  it('stops mentioning that version, across restarts, but not a later one', async () => {
    const { updates, source, clock, make } = setup();
    await updates.status();
    await updates.dismiss('0.2.0');
    expect(await updates.status()).toEqual({ automatic: true, notice: null });
    expect(await make().status()).toEqual({ automatic: true, notice: null });

    source.body = FakeUpdateSource.releaseBody('0.3.0');
    clock.now += DAY;
    expect(await make().status()).toEqual({ automatic: true, notice: release('0.3.0') });
  });
});

describe('createUpdates: "Check for updates"', () => {
  it.each<[string, string | null, unknown]>([
    [
      'a newer version',
      FakeUpdateSource.releaseBody('0.2.0'),
      { kind: 'newer', release: release('0.2.0') },
    ],
    ['the same version', FakeUpdateSource.releaseBody('0.1.0'), { kind: 'newest' }],
    ['an older version', FakeUpdateSource.releaseBody('0.0.9'), { kind: 'newest' }],
    ['no answer', null, { kind: 'failed' }],
  ])('reports %s', async (_description, body, expected) => {
    expect(await setup({}, body).updates.checkNow()).toEqual(expected);
  });

  it('asks whatever the setting, and reports a dismissed version too', async () => {
    const { updates, source } = setup({ automaticAllowed: false });
    await updates.setAutomatic(false);
    await updates.dismiss('0.2.0');
    expect(await updates.checkNow()).toEqual({ kind: 'newer', release: release('0.2.0') });
    expect(source.calls).toBe(1);
  });

  it("counts as the day's check", async () => {
    const { updates, source } = setup();
    await updates.checkNow();
    expect(await updates.status()).toEqual({ automatic: true, notice: release('0.2.0') });
    expect(source.calls).toBe(1);
  });
});

describe('createUpdates: the setting', () => {
  it('turned off: no checks and no notice, across restarts', async () => {
    const { updates, source, make } = setup();
    expect(await updates.setAutomatic(false)).toEqual({ automatic: false, notice: null });
    expect(await make().status()).toEqual({ automatic: false, notice: null });
    expect(source.calls).toBe(0);
  });

  it('turned back on: checks at once if one is due', async () => {
    const { updates, source } = setup();
    await updates.setAutomatic(false);
    expect(await updates.setAutomatic(true)).toEqual({ automatic: true, notice: release('0.2.0') });
    expect(source.calls).toBe(1);
  });
});

describe('createUpdates: the saved state', () => {
  it('saves the answer, the dismissal, and the setting', async () => {
    const { updates, store } = setup();
    await updates.status();
    await updates.dismiss('0.2.0');
    await updates.setAutomatic(false);
    expect(JSON.parse((await store.read()) ?? 'null')).toEqual({
      checkedAt: 100 * DAY,
      latest: { format: 1, ...release('0.2.0') },
      dismissed: '0.2.0',
      automatic: false,
    });
  });

  it('works on in memory when the store can be neither read nor written', async () => {
    const { updates } = setup({ store: unavailableUpdateStateStore });
    expect(await updates.status()).toEqual({ automatic: true, notice: release('0.2.0') });
    await updates.dismiss('0.2.0');
    expect(await updates.status()).toEqual({ automatic: true, notice: null });
  });

  it('starts afresh from a corrupt file', async () => {
    const source = new FakeUpdateSource(FakeUpdateSource.releaseBody('0.2.0'));
    const updates = createUpdates({
      source,
      store: new InMemoryUpdateStateStore('{ not json'),
      currentVersion: '0.1.0',
      automaticAllowed: true,
      now: () => 0,
    });
    expect(await updates.status()).toEqual({ automatic: true, notice: release('0.2.0') });
  });
});
