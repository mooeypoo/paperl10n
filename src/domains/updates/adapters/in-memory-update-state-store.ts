// SPDX-License-Identifier: GPL-3.0-or-later
import { ok } from '#kernel/result';
import type { UpdateStateStore } from '../application/ports/update-state-store.ts';

/** The update state in memory: for the UI harness, which never writes to disk, and tests. */
export class InMemoryUpdateStateStore implements UpdateStateStore {
  private text: string | null;

  constructor(text: string | null = null) {
    this.text = text;
  }

  read(): Promise<string | null> {
    return Promise.resolve(this.text);
  }

  write(text: string) {
    this.text = text;
    return Promise.resolve(ok(undefined));
  }
}
