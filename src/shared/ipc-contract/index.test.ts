// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import { blockKinds, type BlockKind, type InlineKind } from '#domains/document';
import { hintKinds } from '#domains/translation';
import {
  apiMethods,
  blockKindDtos,
  hintKindDtos,
  channelFor,
  errorCodes,
  type ApiMethod,
  type BlockDto,
  type InlineSpanDto,
} from '#ipc-contract';

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

  // The contract repeats the document domain's kinds (it may only import the kernel), so a test
  // keeps them equal: a new block kind can't reach the UI unannounced.
  it('has the same block and inline kinds as the document domain', () => {
    expect([...blockKindDtos]).toEqual([...blockKinds]);
    expectTypeOf<BlockDto['kind']>().toEqualTypeOf<BlockKind>();
    expectTypeOf<InlineSpanDto['kind']>().toEqualTypeOf<InlineKind>();
  });

  it('has the same hint kinds as the translation domain', () => {
    expect([...hintKindDtos]).toEqual([...hintKinds]);
  });
});
