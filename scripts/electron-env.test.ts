// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { electronEnv } from './electron-env.ts';

describe('electronEnv', () => {
  it('drops ELECTRON_RUN_AS_NODE and keeps everything else', () => {
    expect(electronEnv({ ELECTRON_RUN_AS_NODE: '1', PATH: '/bin', DISPLAY: ':0' })).toEqual({
      PATH: '/bin',
      DISPLAY: ':0',
    });
  });

  it('leaves an environment without it unchanged', () => {
    expect(electronEnv({ PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});
