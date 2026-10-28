// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every FolderPicker implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { FolderPicker } from '../application/ports/folder-picker.ts';

/** `make(answer)` builds a picker whose user chooses `answer`, or cancels when it's `null`. */
export function describeFolderPickerContract(
  name: string,
  make: (answer: string | null) => FolderPicker,
): void {
  describe(`FolderPicker contract: ${name}`, () => {
    it('returns the folder the user chose', async () => {
      expect(await make('/home/me/docs').pick()).toBe('/home/me/docs');
    });

    it('returns null when the user cancels', async () => {
      expect(await make(null).pick()).toBeNull();
    });

    it('asks again on every call', async () => {
      const picker = make('/home/me/docs');
      expect([await picker.pick(), await picker.pick()]).toEqual([
        '/home/me/docs',
        '/home/me/docs',
      ]);
    });
  });
}
