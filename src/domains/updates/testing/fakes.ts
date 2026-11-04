// SPDX-License-Identifier: GPL-3.0-or-later
import { err, ok, type Result } from '#kernel/result';
import type { UpdateSource } from '../application/ports/update-source.ts';
import type { UpdateStateStore } from '../application/ports/update-state-store.ts';
import { parseLatestRelease, type LatestRelease } from '../domain/release.ts';

/**
 * Serves `body` as `latest.json` would be (`null`: unreachable), counting the requests. `hold()`
 * keeps answers waiting until the function it returns is called.
 */
export class FakeUpdateSource implements UpdateSource {
  calls = 0;
  body: string | null;
  private held: Promise<void> | null = null;

  constructor(body: string | null) {
    this.body = body;
  }

  /** A `latest.json` body for `version`, with links on GitHub. */
  static releaseBody(version: string): string {
    const page = `https://github.com/mooeypoo/paperl10n/releases/tag/v${version}`;
    return JSON.stringify({
      format: 1,
      version,
      date: '2026-12-01',
      notes: page,
      download: { en: page },
    });
  }

  hold(): () => void {
    let release: () => void = () => undefined;
    this.held = new Promise<undefined>((resolve) => {
      release = () => {
        resolve(undefined);
      };
    }).then(() => {
      this.held = null;
    });
    return release;
  }

  async latest(): Promise<Result<LatestRelease, 'unreachable'>> {
    this.calls++;
    if (this.held !== null) await this.held;
    if (this.body === null) return err('unreachable');
    let value: unknown;
    try {
      value = JSON.parse(this.body);
    } catch {
      return err('unreachable');
    }
    const release = parseLatestRelease(value);
    return release === null ? err('unreachable') : ok(release);
  }
}

/** A store whose disk is gone: nothing reads, every write fails. */
export const unavailableUpdateStateStore: UpdateStateStore = {
  read: () => Promise.reject(new Error('unreadable')),
  write: () => Promise.resolve(err('unwritable')),
};
