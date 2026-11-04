// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every UpdateSource implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { UpdateSource } from '../application/ports/update-source.ts';

const release = {
  format: 1,
  version: '0.2.0',
  date: '2026-12-01',
  notes: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0',
  download: { en: 'https://github.com/mooeypoo/paperl10n/releases/tag/v0.2.0' },
};

/** `make(body)` gives a source serving `body` as `latest.json`; `null`: it can't be reached. */
export function describeUpdateSourceContract(
  name: string,
  make: (body: string | null) => Promise<UpdateSource>,
): void {
  describe(`UpdateSource contract: ${name}`, () => {
    it('answers the release, without fields it does not know', async () => {
      const source = await make(JSON.stringify({ ...release, extra: true }));
      expect(await source.latest()).toEqual({
        ok: true,
        value: {
          version: '0.2.0',
          date: '2026-12-01',
          notes: release.notes,
          download: release.download,
        },
      });
    });

    it.each<[string, string | null]>([
      ['unreachable', null],
      ['not JSON', '<html>'],
      ['another format', JSON.stringify({ ...release, format: 2 })],
      ['a link that is not https', JSON.stringify({ ...release, notes: 'http://a.example/' })],
    ])('is unreachable when the file is %s', async (_description, body) => {
      expect(await (await make(body)).latest()).toEqual({ ok: false, error: 'unreachable' });
    });
  });
}
