// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as document from '#domains/document';

describe('#domains/document public API', () => {
  it('exports exactly these runtime values', () => {
    expect(Object.keys(document).sort()).toEqual(['documentKey']);
  });
});
