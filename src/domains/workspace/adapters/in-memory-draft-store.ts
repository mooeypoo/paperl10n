// SPDX-License-Identifier: GPL-3.0-or-later
import { ok } from '#kernel/result';
import type { Draft, DraftKey, DraftStore } from '../application/ports/draft-store.ts';

const id = (key: DraftKey) => JSON.stringify([key.project, key.locale, key.document]);

/** Drafts in memory: for tests and the UI harness (they're gone when the app restarts). */
export class InMemoryDraftStore implements DraftStore {
  readonly #drafts = new Map<string, { key: DraftKey; draft: Draft }>();

  get(key: DraftKey) {
    return Promise.resolve(ok(this.#drafts.get(id(key))?.draft ?? null));
  }

  put(key: DraftKey, draft: Draft) {
    this.#drafts.set(id(key), { key: { ...key }, draft: { text: draft.text, base: draft.base } });
    return Promise.resolve(ok(undefined));
  }

  remove(key: DraftKey) {
    this.#drafts.delete(id(key));
    return Promise.resolve(ok(undefined));
  }

  documents(project: string, locale: string) {
    const keys = [...this.#drafts.values()]
      .filter(({ key }) => key.project === project && key.locale === locale)
      .map(({ key }) => key.document);
    return Promise.resolve(ok(keys));
  }
}
