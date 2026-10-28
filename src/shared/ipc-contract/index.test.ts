// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import { apiMethods, channelFor, errorCodes, type ApiMethod } from '#ipc-contract';

describe('the IPC contract', () => {
  it('lists every API method exactly once', () => {
    expect(new Set(apiMethods).size).toBe(apiMethods.length);
    expectTypeOf<(typeof apiMethods)[number]>().toEqualTypeOf<ApiMethod>();
  });

  it('gives every method its own namespaced channel', () => {
    const channels = apiMethods.map(channelFor);
    expect(new Set(channels).size).toBe(channels.length);
    for (const channel of channels) expect(channel).toMatch(/^paperl10n:[a-zA-Z]+$/);
  });

  it('lists every error code once, as <area>.<kebab-case>', () => {
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
    for (const code of errorCodes) expect(code).toMatch(/^[a-z]+\.[a-z]+(?:-[a-z]+)*$/);
  });
});
