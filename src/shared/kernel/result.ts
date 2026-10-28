// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The outcome of an operation that can fail in an expected way.
 *
 * Expected failures are values, not exceptions: they keep their type across layers and across IPC.
 * Throw only for bugs (broken invariants). See docs/adr/0007-errors-as-values.md.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
