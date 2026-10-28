// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type Result } from '#kernel/result';

describe('Result', () => {
  it('ok() carries a value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('err() carries an error', () => {
    expect(err({ code: 'x.failed' })).toEqual({ ok: false, error: { code: 'x.failed' } });
  });

  it('narrows on the ok flag', () => {
    const result: Result<number, { code: 'x.failed' }> = Math.random() > 2 ? err({ code: 'x.failed' }) : ok(1);
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<{ code: 'x.failed' }>();
    }
  });

  it('ok() and err() are assignable to any Result with matching side', () => {
    expectTypeOf(ok('a')).toExtend<Result<string, Error>>();
    expectTypeOf(err(new Error('boom'))).toExtend<Result<string, Error>>();
  });
});
