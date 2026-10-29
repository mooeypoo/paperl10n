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

const RECENT_KEY = 'recent-target-languages';
/** How many recent picks the picker shows (docs/plan/M1-languages.md: 4–6). */
export const RECENT_LIMIT = 6;

/** The user's recent target languages, most recent first. Garbage in storage reads as none. */
export function recentLanguages(store: PreferenceStore): string[] {
  try {
    const parsed: unknown = JSON.parse(store.get(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (tag): tag is string => typeof tag === 'string' && tag !== '' && tag.length <= 100,
          )
          .slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/** Puts a language first among the recent picks (once, ignoring case), keeping the newest few. */
export function rememberRecentLanguage(store: PreferenceStore, tag: string): void {
  const others = recentLanguages(store).filter((t) => t.toLowerCase() !== tag.toLowerCase());
  store.set(RECENT_KEY, JSON.stringify([tag, ...others].slice(0, RECENT_LIMIT)));
}
