// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as formats from '#domains/formats';

describe('#domains/formats public API', () => {
  it('exports exactly these runtime values', () => {
    expect(Object.keys(formats).sort()).toEqual([
      'SKIPPED_DIRECTORIES',
      'createFormatRegistry',
      'formatId',
      'parsePluginManifest',
    ]);
  });
});
