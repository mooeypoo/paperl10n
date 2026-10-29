// SPDX-License-Identifier: GPL-3.0-or-later
// The behavior every DraftStore implementation must have, stated once.
import { describe, expect, it } from 'vitest';
import type { DraftKey, DraftStore } from '../application/ports/draft-store.ts';

const key = (document: string, overrides: Partial<DraftKey> = {}): DraftKey => ({
  project: '/home/me/docs',
  locale: 'he',
  document,
  ...overrides,
});

/** `make()` gives a new, empty store. */
export function describeDraftStoreContract(name: string, make: () => Promise<DraftStore>): void {
  describe(`DraftStore contract: ${name}`, () => {
    it('has no draft until one is kept', async () => {
      const store = await make();
      expect(await store.get(key('index'))).toEqual({ ok: true, value: null });
      expect(await store.documents('/home/me/docs', 'he')).toEqual({ ok: true, value: [] });
    });

    it('keeps a draft exactly (CRLF, a BOM, Hebrew, emoji), and the base, or none', async () => {
      const store = await make();
      const draft = { text: '\uFEFF# שלום 😀\r\n\r\nטקסט', base: '# שלום\r\n' };
      expect(await store.put(key('index'), draft)).toEqual({ ok: true, value: undefined });
      expect(await store.get(key('index'))).toEqual({ ok: true, value: draft });
      await store.put(key('guide/intro'), { text: 'new', base: null });
      expect(await store.get(key('guide/intro'))).toEqual({
        ok: true,
        value: { text: 'new', base: null },
      });
    });

    it('replaces a draft, and forgets it on remove (removing nothing is fine)', async () => {
      const store = await make();
      await store.put(key('index'), { text: 'one', base: null });
      await store.put(key('index'), { text: 'two', base: 'x' });
      expect(await store.get(key('index'))).toEqual({
        ok: true,
        value: { text: 'two', base: 'x' },
      });
      expect(await store.remove(key('index'))).toEqual({ ok: true, value: undefined });
      expect(await store.get(key('index'))).toEqual({ ok: true, value: null });
      expect(await store.remove(key('index'))).toEqual({ ok: true, value: undefined });
    });

    it('keeps drafts apart by project, locale, and page', async () => {
      const store = await make();
      const keys = [
        key('index'),
        key('index', { locale: 'ar' }),
        key('index', { project: '/home/me/other' }),
        key('guide/index'),
        // Separators inside a part can't make two keys collide.
        key('a', { project: '/x', locale: 'b/c' }),
        key('c', { project: '/x', locale: 'b/' }),
      ];
      for (const [index, each] of keys.entries()) {
        await store.put(each, { text: String(index), base: null });
      }
      for (const [index, each] of keys.entries()) {
        expect(await store.get(each)).toEqual({
          ok: true,
          value: { text: String(index), base: null },
        });
      }
      const listed = await store.documents('/home/me/docs', 'he');
      expect(listed.ok && [...listed.value].sort()).toEqual(['guide/index', 'index']);
    });
  });
}
