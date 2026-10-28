// SPDX-License-Identifier: GPL-3.0-or-later
// Interface preferences (theme, interface language): per-user conveniences, kept in the renderer.
// Losing them is harmless, so every access tolerates storage that's missing or refuses.

/** A tiny string store. Electron and the harness use `localStorage`; tests use memory. */
export interface PreferenceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** `localStorage`, or nothing at all when it's unavailable (private modes, blocked storage). */
export function browserPreferences(storage: () => Storage = () => localStorage): PreferenceStore {
  return {
    get(key) {
      try {
        return storage().getItem(`paperl10n.${key}`);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage().setItem(`paperl10n.${key}`, value);
      } catch {
        // Not saved: the preference applies until the window closes.
      }
    },
  };
}

export function memoryPreferences(initial: Readonly<Record<string, string>> = {}): PreferenceStore {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
  };
}
