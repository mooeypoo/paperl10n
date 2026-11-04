// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every UpdateStateStore implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { UpdateStateStore } from '../application/ports/update-state-store.ts';

/** `make()` gives a new, empty store. */
export function describeUpdateStateStoreContract(
  name: string,
  make: () => Promise<UpdateStateStore>,
): void {
  describe(`UpdateStateStore contract: ${name}`, () => {
    it('has nothing until something is written', async () => {
      expect(await (await make()).read()).toBeNull();
    });

    it('reads back exactly what was written, the last write winning', async () => {
      const store = await make();
      expect(await store.write('{"automatic": true}\n')).toEqual({ ok: true, value: undefined });
      expect(await store.write('{"dismissed": "0.2.0", "note": "שלום 😀"}\r\n')).toEqual({
        ok: true,
        value: undefined,
      });
      expect(await store.read()).toBe('{"dismissed": "0.2.0", "note": "שלום 😀"}\r\n');
    });
  });
}
