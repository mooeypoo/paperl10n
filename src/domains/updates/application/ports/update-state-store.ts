// SPDX-License-Identifier: GPL-3.0-or-later
import type { Result } from '#kernel/result';

/** Where the update state is kept between runs, as text (`updates.json` in the app's data). */
export interface UpdateStateStore {
  /** The saved text; `null` when nothing was saved or it can't be read. */
  read(): Promise<string | null>;
  /** Replaces the saved text. */
  write(text: string): Promise<Result<void, 'unwritable'>>;
}
