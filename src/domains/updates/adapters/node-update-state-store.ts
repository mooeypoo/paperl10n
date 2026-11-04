// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { err, ok } from '#kernel/result';
import type { UpdateStateStore } from '../application/ports/update-state-store.ts';

/**
 * The update state as one file in the app's data (`updates.json`), readable only by the user.
 * Writes are atomic: a temporary file, flushed, then renamed.
 */
export function nodeUpdateStateStore(file: string): UpdateStateStore {
  return {
    read: () => readFile(file, 'utf8').catch(() => null),
    async write(text) {
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(text, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, file);
        return ok(undefined);
      } catch {
        await unlink(temporary).catch(() => undefined);
        return err('unwritable');
      }
    },
  };
}
